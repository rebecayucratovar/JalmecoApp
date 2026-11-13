"""POST /mi/seguimiento-detenido: alerta en jornada (crítica) y también fuera de ella (advertencia)."""
from django.test import TestCase
from django.utils import timezone

from alertas.models import Alerta
from jornadas.models import Jornada

from .autenticacion import emitir_tokens
from .models import Tecnico


class SeguimientoDetenidoTest(TestCase):
    def setUp(self):
        self.t = Tecnico.objects.create(nombre='Kevin Apaza', usuario='kevin.apaza')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(self.t)["access"]}'}

    def avisar(self, motivo):
        r = self.client.post('/api/v1/mi/seguimiento-detenido', {'motivo': motivo},
                             content_type='application/json', **self.auth)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()['alerta_creada']

    def avisar_datos(self, datos):
        return self.client.post('/api/v1/mi/seguimiento-detenido', datos,
                                content_type='application/json', **self.auth).json()

    def test_preaviso_de_ubicacion_apagada_se_ve_sin_alerta(self):
        Jornada.objects.create(tecnico=self.t, inicio=timezone.now())
        r = self.avisar_datos({'motivo': 'gps_apagado', 'preaviso': True})
        self.assertFalse(r['alerta_creada'])
        self.assertFalse(Alerta.objects.exists())
        self.t.refresh_from_db()
        self.assertEqual(self.t.estado_actual, 'ubicacion_apagada')
        # A los 5 min la app manda el aviso normal → alerta crítica
        self.assertTrue(self.avisar('gps_apagado'))
        self.assertEqual(Alerta.objects.get().nivel, 'critico')

    def test_preaviso_fuera_de_jornada_no_cambia_nada(self):
        self.avisar_datos({'motivo': 'gps_apagado', 'preaviso': True})
        self.t.refresh_from_db()
        self.assertEqual(self.t.estado_actual, 'fuera_jornada')

    def test_en_jornada_es_critica(self):
        Jornada.objects.create(tecnico=self.t, inicio=timezone.now())
        self.assertTrue(self.avisar('gps_apagado'))
        self.assertEqual(Alerta.objects.get().nivel, 'critico')

    def test_cerrar_sesion_fuera_de_jornada_avisa_una_vez(self):
        self.assertTrue(self.avisar('cerro_sesion'))
        alerta = Alerta.objects.get()
        self.assertEqual((alerta.tipo, alerta.nivel), ('seguimiento_detenido', 'advertencia'))
        self.assertIn('fuera de jornada', alerta.mensaje)
        self.assertIn('no registrará su próxima jornada', alerta.mensaje)
        self.assertNotIn('durante la jornada', alerta.mensaje)  # no mezclar los dos casos
        self.assertFalse(self.avisar('cerro_sesion'))  # repetida en 12 h: no
        self.assertEqual(Alerta.objects.count(), 1)

    def test_ubicacion_apagada_o_sin_permiso_fuera_de_jornada_no_avisa(self):
        self.assertFalse(self.avisar('gps_apagado'))
        self.assertFalse(self.avisar('permiso_revocado'))
        self.assertFalse(Alerta.objects.exists())
