"""Pruebas de las tareas del worker. Correr: docker compose exec backend python manage.py test"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.contrib.gis.geos import Point
from django.test import TestCase

from alertas.models import Alerta
from alertas.servicios import revisar_bateria, revisar_sin_conexion
from core.models import Configuracion
from core.pausas import fin_ultima_franja, franjas_activas, minutos_utiles
from core.retencion import limpiar, restar_meses
from jornadas.models import Jornada
from ubicaciones.models import Ubicacion
from usuarios.models import Tecnico
from verificaciones import servicios as verificaciones
from verificaciones.models import Verificacion

LA_PAZ = ZoneInfo('America/La_Paz')


def lp(dia, hora, minuto=0):
    """Fecha/hora en La Paz (noviembre 2026)."""
    return datetime(2026, 11, dia, hora, minuto, tzinfo=LA_PAZ)


class Base(TestCase):
    def setUp(self):
        self.config = Configuracion.actual()
        self.tecnico = Tecnico.objects.create(usuario='juan', nombre='Juan Pérez', codigo='JAL-0001')

    def jornada(self, inicio, **campos_tecnico):
        Tecnico.objects.filter(pk=self.tecnico.pk).update(**campos_tecnico)
        self.tecnico.refresh_from_db()
        return Jornada.objects.create(tecnico=self.tecnico, inicio=inicio)


class PausasTest(TestCase):
    def test_minutos_utiles_descuenta_el_almuerzo(self):
        franjas = franjas_activas()  # Almuerzo 12:00–13:00 (dato inicial)
        self.assertEqual(minutos_utiles(lp(11, 11), lp(11, 18), franjas), 6 * 60)
        self.assertEqual(minutos_utiles(lp(11, 9), lp(11, 11), franjas), 120)
        self.assertEqual(minutos_utiles(lp(11, 19), lp(11, 18), franjas), 0)

    def test_fin_ultima_franja(self):
        franjas = franjas_activas()
        self.assertIsNone(fin_ultima_franja(lp(11, 11), franjas))
        self.assertEqual(fin_ultima_franja(lp(11, 15), franjas), lp(11, 13))


class SorteoHuellasTest(Base):
    def test_no_pide_en_el_almuerzo_ni_al_marcar_entrada(self):
        self.jornada(lp(11, 8))
        self.assertEqual(verificaciones.programar(lp(11, 12, 30), azar=lambda: 0), 0)
        self.assertEqual(verificaciones.programar(lp(11, 8, 5), azar=lambda: 0), 0)

    def test_pide_segun_el_sorteo(self):
        self.jornada(lp(11, 8))
        self.assertEqual(verificaciones.programar(lp(11, 9), azar=lambda: 0.99), 0)  # no salió
        self.assertEqual(verificaciones.programar(lp(11, 9), azar=lambda: 0), 1)  # salió
        self.assertEqual(Verificacion.objects.get().solicitada_en, lp(11, 9))

    def test_no_repite_con_una_pendiente_ni_antes_de_la_separacion(self):
        self.jornada(lp(11, 8))
        verificaciones.programar(lp(11, 9), azar=lambda: 0)
        self.assertEqual(verificaciones.programar(lp(11, 9, 1), azar=lambda: 0), 0)  # pendiente
        Verificacion.objects.update(resultado=Verificacion.Resultado.EXITO)
        self.assertEqual(verificaciones.programar(lp(11, 9, 30), azar=lambda: 0), 0)  # muy pronto
        self.assertEqual(verificaciones.programar(lp(11, 10, 30), azar=lambda: 0), 1)

    def test_cerca_del_fin_se_completan_las_del_dia(self):
        self.jornada(lp(11, 8))
        # A las 17:59 queda 1 minuto útil y faltan 2: probabilidad ≥ 1 aunque el azar dé 0.99
        self.assertEqual(verificaciones.programar(lp(11, 17, 59), azar=lambda: 0.99), 1)

    def test_maximo_por_dia_y_minimo_fuera_de_horario(self):
        self.jornada(lp(11, 8))
        for h in (9, 11):
            Verificacion.objects.create(tecnico=self.tecnico, solicitada_en=lp(11, h),
                                        resultado=Verificacion.Resultado.EXITO)
        self.assertEqual(verificaciones.programar(lp(11, 16), azar=lambda: 0), 0)  # ya tuvo 2

        Verificacion.objects.all().delete()
        self.assertEqual(verificaciones.programar(lp(11, 19), azar=lambda: 0.99), 1)  # mínimo 1
        Verificacion.objects.update(resultado=Verificacion.Resultado.EXITO)
        self.assertEqual(verificaciones.programar(lp(11, 21), azar=lambda: 0), 0)

    def test_no_pide_sin_conexion_ni_fuera_de_jornada(self):
        self.assertEqual(verificaciones.programar(lp(11, 10), azar=lambda: 0), 0)  # sin jornada
        self.jornada(lp(11, 8), estado_actual=Tecnico.Estado.SIN_CONEXION)
        self.assertEqual(verificaciones.programar(lp(11, 10), azar=lambda: 0), 0)


class SinConexionTest(Base):
    def test_alerta_una_vez_por_corte(self):
        self.jornada(lp(11, 8), ultima_actualizacion=lp(11, 9), estado_actual=Tecnico.Estado.EN_PARADA)
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 5)), 0)  # 5 min: todavía no
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 10)), 1)
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 20)), 0)  # mismo corte
        self.tecnico.refresh_from_db()
        self.assertEqual(self.tecnico.estado_actual, Tecnico.Estado.SIN_CONEXION)
        self.assertIn('desde las 09:00', Alerta.objects.get().mensaje)

        # Vuelve a enviar y se corta de nuevo → otra alerta
        Tecnico.objects.filter(pk=self.tecnico.pk).update(ultima_actualizacion=lp(11, 10),
                                                          estado_actual=Tecnico.Estado.EN_PARADA)
        self.assertEqual(revisar_sin_conexion(lp(11, 10, 15)), 1)

    def test_el_almuerzo_no_cuenta_como_corte(self):
        self.jornada(lp(11, 8), ultima_actualizacion=lp(11, 11, 59))
        self.assertEqual(revisar_sin_conexion(lp(11, 12, 30)), 0)
        self.assertEqual(revisar_sin_conexion(lp(11, 13, 5)), 0)  # cuenta desde las 13:00
        self.assertEqual(revisar_sin_conexion(lp(11, 13, 10)), 1)

    def test_marco_entrada_y_el_celular_nunca_envio(self):
        self.jornada(lp(11, 8), ultima_actualizacion=lp(10, 17))  # dato de ayer
        self.assertEqual(revisar_sin_conexion(lp(11, 8, 10)), 1)
        self.assertIn('Marcó entrada a las 08:00', Alerta.objects.get().mensaje)


class BateriaTest(Base):
    def test_una_alerta_por_jornada(self):
        self.jornada(lp(11, 8), ultima_bateria=12, ultima_actualizacion=lp(11, 10))
        self.assertEqual(revisar_bateria(lp(11, 10, 1)), 1)
        self.assertEqual(revisar_bateria(lp(11, 10, 30)), 0)
        self.assertEqual(Alerta.objects.get().mensaje, 'Batería del celular al 12 %.')

    def test_ignora_bateria_de_otra_jornada_o_suficiente(self):
        self.jornada(lp(11, 8), ultima_bateria=10, ultima_actualizacion=lp(10, 17))
        self.assertEqual(revisar_bateria(lp(11, 9)), 0)
        Tecnico.objects.filter(pk=self.tecnico.pk).update(ultima_bateria=40, ultima_actualizacion=lp(11, 9))
        self.assertEqual(revisar_bateria(lp(11, 9, 5)), 0)


class RetencionTest(Base):
    def test_restar_meses(self):
        self.assertEqual(restar_meses(lp(11, 10), 12), datetime(2025, 11, 11, 10, tzinfo=LA_PAZ))
        self.assertEqual(restar_meses(datetime(2026, 3, 31, tzinfo=LA_PAZ), 1), datetime(2026, 2, 28, tzinfo=LA_PAZ))

    def test_borra_solo_lo_viejo(self):
        vieja = Jornada.objects.create(tecnico=self.tecnico, inicio=lp(1, 8) - timedelta(days=400),
                                       fin=lp(1, 18) - timedelta(days=400), estado=Jornada.Estado.CERRADA)
        nueva = Jornada.objects.create(tecnico=self.tecnico, inicio=lp(10, 8), fin=lp(10, 18),
                                       estado=Jornada.Estado.CERRADA)
        for j in (vieja, nueva):
            Ubicacion.objects.create(tecnico=self.tecnico, jornada=j, punto=Point(-68.1, -16.5),
                                     registrado_en=j.inicio + timedelta(hours=1))
        borrado = limpiar(12, ahora=lp(11, 3))
        self.assertEqual(borrado, {'ubicacion': 1, 'jornada': 1})
        self.assertEqual(list(Jornada.objects.all()), [nueva])
        self.assertEqual(Ubicacion.objects.count(), 1)
