from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from jornadas.models import Jornada
from usuarios.autenticacion import emitir_tokens
from usuarios.models import Administrador, Tecnico

from .models import Alerta


class BandejaAlertasTest(TestCase):
    def setUp(self):
        self.admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(self.admin)["access"]}'}
        self.juan = Tecnico.objects.create(usuario='juan', nombre='Juan', codigo='JAL-1021',
                                           ultima_lat=-16.5, ultima_lng=-68.1)
        self.luis = Tecnico.objects.create(usuario='luis', nombre='Luis')
        Jornada.objects.create(tecnico=self.juan, inicio=timezone.now())
        ahora = timezone.now()
        self.a1 = Alerta.objects.create(tecnico=self.juan, tipo=Alerta.Tipo.SIN_CONEXION, mensaje='Sin datos', creada_en=ahora)
        self.a2 = Alerta.objects.create(tecnico=self.luis, tipo=Alerta.Tipo.BATERIA_BAJA, creada_en=ahora - timedelta(hours=1))
        self.vieja = Alerta.objects.create(tecnico=self.luis, tipo=Alerta.Tipo.BATERIA_BAJA, creada_en=ahora - timedelta(days=20))

    def get(self, ruta):
        return self.client.get(f'/api/v1/{ruta}', **self.auth)

    def post(self, ruta, datos=None):
        return self.client.post(f'/api/v1/{ruta}', datos or {}, content_type='application/json', **self.auth)

    def test_lista_ultimos_7_dias_con_conteo_y_sin_ubicacion(self):
        r = self.get('alertas').json()
        self.assertEqual([a['id'] for a in r['alertas']], [self.a1.id, self.a2.id])
        self.assertEqual(r['conteo'], {'todas': 2, 'nuevas': 2, 'atendidas': 0})
        tecnico = r['alertas'][0]['tecnico']
        self.assertEqual((tecnico['nombre'], tecnico['en_jornada']), ('Juan', True))
        self.assertNotIn('ultima_lat', tecnico)
        self.assertFalse(r['alertas'][1]['tecnico']['en_jornada'])

    def test_filtros(self):
        self.assertEqual(len(self.get('alertas?tipo=bateria_baja').json()['alertas']), 1)
        hace = (timezone.localdate() - timedelta(days=30)).isoformat()
        self.assertEqual(len(self.get(f'alertas?desde={hace}').json()['alertas']), 3)
        self.assertEqual(len(self.get(f'alertas?tecnico={self.luis.id}&desde={hace}').json()['alertas']), 2)
        self.assertEqual(self.get('alertas?tipo=inventado').status_code, 400)
        self.assertEqual(self.get('alertas?desde=2026-11-10&hasta=2026-11-01').status_code, 400)

    def test_atender_una_y_todas(self):
        r = self.post(f'alertas/{self.a1.id}/atender').json()
        self.assertEqual((r['estado'], r['atendida_por']), ('atendida', 'Ana'))
        self.assertEqual(self.get('alertas?estado=nueva').json()['conteo'], {'todas': 2, 'nuevas': 1, 'atendidas': 1})
        self.assertEqual(self.post('alertas/atender-todas').json(), {'atendidas': 2})  # a2 y la vieja
        self.assertEqual(self.get('alertas/resumen').json()['nuevas'], 0)
        self.assertEqual(self.post('alertas/9999/atender').status_code, 404)

    def test_resumen_para_la_campana(self):
        Alerta.objects.filter(pk=self.a1.pk).update(nivel=Alerta.Nivel.CRITICO)
        r = self.get('alertas/resumen').json()
        self.assertEqual((r['nuevas'], r['criticas'], len(r['ultimas'])), (3, 1, 3))

    def test_solo_administradores(self):
        tecnico = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(self.juan)["access"]}'}
        self.assertEqual(self.client.get('/api/v1/alertas', **tecnico).status_code, 403)
