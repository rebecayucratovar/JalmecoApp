"""Pruebas de las tareas del worker. Correr: docker compose exec backend python manage.py test"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.contrib.gis.geos import Point
from django.test import TestCase

from django.core import mail

from alertas.correo import enviar_pendientes
from alertas.models import Alerta
from alertas.servicios import revisar_bateria, revisar_sin_conexion
from core.models import Configuracion
from core.pausas import fin_ultima_franja, franjas_activas, minutos_utiles
from core.retencion import limpiar, restar_meses
from jornadas.models import Jornada
from ubicaciones.models import Ubicacion
from usuarios.models import Administrador, Tecnico
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
        # Umbral por defecto: 30 min (un mantenimiento en el ducto del ascensor no alerta)
        self.jornada(lp(11, 8), ultima_actualizacion=lp(11, 9), estado_actual=Tecnico.Estado.EN_PARADA)
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 25)), 0)
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 30)), 1)
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 45)), 0)  # mismo corte
        self.tecnico.refresh_from_db()
        self.assertEqual(self.tecnico.estado_actual, Tecnico.Estado.SIN_CONEXION)
        self.assertIn('desde las 09:00', Alerta.objects.get().mensaje)

        # Vuelve a enviar y se corta de nuevo → otra alerta
        Tecnico.objects.filter(pk=self.tecnico.pk).update(ultima_actualizacion=lp(11, 10),
                                                          estado_actual=Tecnico.Estado.EN_PARADA)
        self.assertEqual(revisar_sin_conexion(lp(11, 10, 35)), 1)

    def test_umbral_configurable(self):
        Configuracion.objects.update(sin_conexion_min=10)
        self.jornada(lp(11, 8), ultima_actualizacion=lp(11, 9))
        self.assertEqual(revisar_sin_conexion(lp(11, 9, 10)), 1)

    def test_el_almuerzo_no_cuenta_como_corte(self):
        self.jornada(lp(11, 8), ultima_actualizacion=lp(11, 11, 59))
        self.assertEqual(revisar_sin_conexion(lp(11, 12, 45)), 0)
        self.assertEqual(revisar_sin_conexion(lp(11, 13, 20)), 0)  # cuenta desde las 13:00
        self.assertEqual(revisar_sin_conexion(lp(11, 13, 30)), 1)

    def test_marco_entrada_y_el_celular_nunca_envio(self):
        self.jornada(lp(11, 8), ultima_actualizacion=lp(10, 17))  # dato de ayer
        self.assertEqual(revisar_sin_conexion(lp(11, 8, 30)), 1)
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


class CorreoAlertasTest(Base):
    def alerta(self, creada_en, **campos):
        datos = {'tipo': Alerta.Tipo.BATERIA_BAJA, 'mensaje': 'Batería del celular al 12 %.', **campos}
        return Alerta.objects.create(tecnico=self.tecnico, creada_en=creada_en, **datos)

    def test_un_correo_con_las_nuevas_y_no_repite(self):
        Configuracion.objects.update(alertas_correos='jefe@jalmeco.com, otro@jalmeco.com')
        self.alerta(lp(11, 10))
        self.alerta(lp(11, 10, 5), tipo=Alerta.Tipo.VERIFICACION_NO_REALIZADA, nivel=Alerta.Nivel.CRITICO)
        self.assertEqual(enviar_pendientes(lp(11, 10, 6)), 2)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['jefe@jalmeco.com', 'otro@jalmeco.com'])
        self.assertEqual(correo.subject, 'Jalmeco GPS · 2 alertas nuevas (1 críticas)')
        self.assertIn('[CRÍTICA] Verificación no realizada — Juan Pérez (JAL-0001)', correo.body)
        self.assertEqual(enviar_pendientes(lp(11, 10, 7)), 0)  # ya avisadas

    def test_sin_lista_va_a_los_administradores_activos(self):
        Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        Administrador.objects.create(nombre='Ex', email='ex@jalmeco.com', password_hash='x', activo=False)
        self.alerta(lp(11, 10))
        enviar_pendientes(lp(11, 10, 1))
        self.assertEqual(mail.outbox[0].to, ['ana@jalmeco.com'])
        self.assertEqual(mail.outbox[0].subject, 'Jalmeco GPS · Batería baja — Juan Pérez')

    def test_no_envia_viejas_ni_atendidas(self):
        Configuracion.objects.update(alertas_correos='jefe@jalmeco.com')
        self.alerta(lp(11, 1))  # de hace 9 h
        self.alerta(lp(11, 9, 59), estado=Alerta.Estado.ATENDIDA)
        self.assertEqual(enviar_pendientes(lp(11, 10)), 0)
        self.assertEqual(mail.outbox, [])


class ConfiguracionPanelTest(TestCase):
    """GET/PUT /config desde el panel."""

    def setUp(self):
        from core.models import FranjaPausa
        from usuarios.autenticacion import emitir_tokens
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}
        FranjaPausa.objects.all().delete()
        self.almuerzo = FranjaPausa.objects.create(nombre='Almuerzo', hora_inicio='12:00', hora_fin='13:00')

    def put(self, datos):
        return self.client.put('/api/v1/config', datos, content_type='application/json', **self.auth)

    def test_lee_con_almuerzo_y_destinatarios(self):
        r = self.client.get('/api/v1/config', **self.auth).json()
        self.assertEqual((r['horario_inicio'], r['horario_fin']), ('08:00', '18:00'))
        self.assertEqual(r['almuerzo'], {'inicio': '12:00', 'fin': '13:00'})
        self.assertEqual(r['alertas_destinatarios'], ['ana@jalmeco.com'])  # vacío = administradores

    def test_guarda_solo_lo_enviado_y_normaliza_correos(self):
        r = self.put({'sin_conexion_min': 45, 'alertas_correos': 'Jefe@Jalmeco.com; otro@x.com\nJEFE@jalmeco.com',
                      'almuerzo': {'inicio': '12:30', 'fin': '13:30'}})
        self.assertEqual(r.status_code, 200, r.content)
        datos = r.json()
        self.assertEqual(datos['sin_conexion_min'], 45)
        self.assertEqual(datos['bateria_baja_pct'], 15)
        self.assertEqual(datos['alertas_correos'], 'jefe@jalmeco.com, otro@x.com')
        self.assertEqual(datos['almuerzo'], {'inicio': '12:30', 'fin': '13:30'})
        self.almuerzo.refresh_from_db()
        self.assertEqual(f'{self.almuerzo.hora_inicio:%H:%M}', '12:30')

    def test_valida_rangos_horario_y_almuerzo(self):
        def errores(datos):
            r = self.put(datos)
            self.assertEqual(r.status_code, 400)
            return set(r.json()['detalle'])
        self.assertEqual(errores({'gps_distancia_m': 1}), {'gps_distancia_m'})
        self.assertEqual(errores({'horario_inicio': '18:00', 'horario_fin': '08:00'}), {'horario_fin'})
        self.assertEqual(errores({'almuerzo': {'inicio': '19:00', 'fin': '20:00'}}), {'almuerzo'})
        self.assertEqual(errores({'horario_fin': '12:30'}), {'almuerzo'})  # dejaría el almuerzo afuera
        self.assertEqual(errores({'alertas_correos': 'no-es-correo'}), {'alertas_correos'})
        self.assertEqual(errores({'almuerzo': None}), {'almuerzo'})  # no se puede quitar
        self.assertEqual(Configuracion.actual().gps_distancia_m, 25)

    def test_solo_admin(self):
        self.assertEqual(self.client.get('/api/v1/config').status_code, 401)


class DashboardTest(TestCase):
    """GET /dashboard — resumen de Inicio."""

    def setUp(self):
        from core.models import FranjaPausa
        from usuarios.autenticacion import emitir_tokens
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}
        FranjaPausa.objects.all().delete()
        FranjaPausa.objects.create(nombre='Almuerzo', hora_inicio='12:00', hora_fin='13:00')

    def test_resumen_sin_ubicaciones(self):
        from django.utils import timezone
        ahora = timezone.now()
        juan = Tecnico.objects.create(usuario='juan', nombre='Juan', estado_actual='sin_conexion',
                                      ultima_bateria=9, ultima_lat=-16.5, ultima_lng=-68.1)
        luis = Tecnico.objects.create(usuario='luis', nombre='Luis', estado_actual='en_trayecto', ultima_bateria=80)
        Tecnico.objects.create(usuario='eva', nombre='Eva', estado_actual='en_parada')  # fuera de jornada
        Tecnico.objects.create(usuario='baja', nombre='Baja', activo=False)
        Jornada.objects.create(tecnico=juan, inicio=ahora - timedelta(minutes=30))
        Jornada.objects.create(tecnico=luis, inicio=ahora - timedelta(minutes=10))
        Alerta.objects.create(tecnico=juan, tipo=Alerta.Tipo.SIN_CONEXION, nivel=Alerta.Nivel.CRITICO)

        r = self.client.get('/api/v1/dashboard', **self.auth).json()
        p = r['personal']
        self.assertEqual((p['activos'], p['en_jornada'], p['en_trayecto'], p['sin_conexion'], p['sin_pin']), (3, 2, 1, 1, 3))
        self.assertEqual((r['alertas']['nuevas'], r['alertas']['criticas']), (1, 1))
        self.assertEqual(r['sin_conexion_min'], 30)
        self.assertNotIn('ultima_lat', str(r))  # el resumen no lleva ubicaciones
        self.assertEqual(len(r['horas_campo']), 7)

    def test_horas_en_campo_sin_almuerzo_y_cortadas_por_dia(self):
        from core.inicio import horas_en_campo
        from core.pausas import franjas_activas
        t = Tecnico.objects.create(usuario='juan', nombre='Juan')
        Jornada.objects.create(tecnico=t, inicio=lp(10, 8), fin=lp(10, 18), estado='cerrada')  # 10 h − 1 almuerzo
        Jornada.objects.create(tecnico=t, inicio=lp(11, 8), fin=None)  # abierta: hasta "ahora"
        dias = horas_en_campo(lp(9, 0).date(), lp(11, 0).date(), lp(11, 10, 30), franjas_activas())
        self.assertEqual(dias, [
            {'fecha': '2026-11-09', 'horas': 0, 'personas': 0},
            {'fecha': '2026-11-10', 'horas': 9.0, 'personas': 1},
            {'fecha': '2026-11-11', 'horas': 2.5, 'personas': 1},
        ])
