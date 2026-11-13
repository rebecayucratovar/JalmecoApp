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
        self.assertTrue(self.avisar('permiso_revocado'))  # otro motivo: sí
        self.assertEqual(Alerta.objects.count(), 2)

    def test_apagar_gps_fuera_de_jornada_no_avisa(self):
        self.assertFalse(self.avisar('gps_apagado'))
        self.assertFalse(Alerta.objects.exists())
