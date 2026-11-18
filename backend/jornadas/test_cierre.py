"""Cierre automático de jornadas sin salida marcada (fin del horario + cierre_auto_horas)."""
from datetime import datetime, time, timedelta

from django.contrib.gis.geos import Point
from django.test import TestCase
from django.utils import timezone

from alertas.models import Alerta
from core.models import Configuracion
from odoo_sync import servicios as odoo
from odoo_sync.test_sincronizacion import OdooFalso
from ubicaciones.models import Ubicacion
from usuarios.models import Tecnico

from .models import Jornada
from .servicios import cerrar_olvidadas


def a_las(dia, h, m=0):
    return timezone.make_aware(datetime.combine(dia, time(h, m)))


class CierreAutomaticoTest(TestCase):
    def setUp(self):
        self.dia = timezone.localdate() - timedelta(days=1)
        self.t = Tecnico.objects.create(nombre='Kevin', usuario='kevin', odoo_employee_id=10,
                                        estado_actual=Tecnico.Estado.EN_PARADA)
        Configuracion.objects.filter(pk=Configuracion.actual().pk).update(cierre_auto_horas=2)

    def test_por_defecto_cierra_a_las_22_por_las_horas_extra(self):
        Configuracion.objects.filter(pk=Configuracion.actual().pk).update(cierre_auto_horas=4)
        Jornada.objects.create(tecnico=self.t, inicio=a_las(self.dia, 8))
        self.assertEqual(cerrar_olvidadas(a_las(self.dia, 21, 30)), 0)  # sigue en horas extra
        self.assertEqual(cerrar_olvidadas(a_las(self.dia, 22, 1)), 1)

    def test_no_cierra_antes_del_limite(self):
        Jornada.objects.create(tecnico=self.t, inicio=a_las(self.dia, 8))
        self.assertEqual(cerrar_olvidadas(a_las(self.dia, 19, 59)), 0)  # 18:00 + 2 h = 20:00

    def test_cierra_al_fin_del_horario_o_al_ultimo_punto(self):
        j = Jornada.objects.create(tecnico=self.t, inicio=a_las(self.dia, 8))
        self.assertEqual(cerrar_olvidadas(a_las(self.dia, 20, 1)), 1)
        j.refresh_from_db()
        self.assertEqual((j.estado, j.fin, j.cierre_automatico), ('cerrada', a_las(self.dia, 18), True))
        self.t.refresh_from_db()
        self.assertEqual(self.t.estado_actual, 'fuera_jornada')
        alerta = Alerta.objects.get(tipo='salida_no_marcada')
        self.assertIn('no marcó salida', alerta.mensaje)

        # Siguió trabajando: se cierra en su último punto
        j2 = Jornada.objects.create(tecnico=self.t, inicio=a_las(self.dia, 8))
        Ubicacion.objects.create(tecnico=self.t, jornada=j2, punto=Point(-68.1, -16.5, srid=4326),
                                 registrado_en=a_las(self.dia, 19, 10))
        cerrar_olvidadas(a_las(self.dia, 21))
        j2.refresh_from_db()
        self.assertEqual(j2.fin, a_las(self.dia, 19, 10))

    def test_entrada_fuera_de_horario_tiene_4_horas(self):
        Jornada.objects.create(tecnico=self.t, inicio=a_las(self.dia, 21))
        self.assertEqual(cerrar_olvidadas(a_las(self.dia, 23)), 0)
        self.assertEqual(cerrar_olvidadas(a_las(self.dia + timedelta(days=1), 1, 1)), 1)

    def test_la_sincronizacion_no_la_reabre(self):
        fake = OdooFalso()
        fake.asistencia(500, 10, a_las(self.dia, 8))  # en Odoo sigue abierta
        odoo.sincronizar_asistencias(fake, a_las(self.dia, 9))
        cerrar_olvidadas(a_las(self.dia, 20, 30))
        self.assertEqual(odoo.sincronizar_asistencias(fake, a_las(self.dia, 20, 31)), 0)
        j = Jornada.objects.get(odoo_attendance_id=500)
        self.assertEqual(j.estado, 'cerrada')
        # Al otro día marca salida en Odoo con la hora real (antes de nuestro cierre): vale esa
        fake.asistencia(500, 10, a_las(self.dia, 8), a_las(self.dia, 17, 30))
        odoo.sincronizar_asistencias(fake, a_las(self.dia, 21))
        j.refresh_from_db()
        self.assertEqual((j.estado, j.fin), ('cerrada', a_las(self.dia, 17, 30)))
        # …o después (horas extra hasta las 21:00): también vale la de Odoo
        fake.asistencia(500, 10, a_las(self.dia, 8), a_las(self.dia, 21))
        odoo.sincronizar_asistencias(fake, a_las(self.dia, 21, 5))
        j.refresh_from_db()
        self.assertEqual((j.estado, j.fin), ('cerrada', a_las(self.dia, 21)))
