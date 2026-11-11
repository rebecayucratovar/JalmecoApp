from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from jornadas.models import Jornada
from usuarios.autenticacion import emitir_tokens
from usuarios.models import Administrador, Tecnico


class MapaEnVivoTest(TestCase):
    def setUp(self):
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}
        ahora = timezone.now()
        datos = dict(ultima_lat=-16.5, ultima_lng=-68.1, ultima_bateria=80, ultima_velocidad=30,
                     ultima_actualizacion=ahora, estado_actual=Tecnico.Estado.EN_TRAYECTO)
        self.en_jornada = Tecnico.objects.create(usuario='ana.c', nombre='Ana Condori', **datos)
        self.fuera = Tecnico.objects.create(usuario='beto', nombre='Beto Rojas', **datos)
        Tecnico.objects.create(usuario='ex', nombre='Ex Empleado', activo=False)
        Jornada.objects.create(tecnico=self.en_jornada, inicio=ahora - timedelta(hours=2))

    def test_todo_el_personal_activo_y_sin_ubicacion_fuera_de_jornada(self):
        r = self.client.get('/api/v1/mapa-en-vivo', **self.auth)
        self.assertEqual(r.status_code, 200)
        tecnicos = {t['nombre']: t for t in r.json()['tecnicos']}
        self.assertEqual(list(tecnicos), ['Ana Condori', 'Beto Rojas'])

        ana = tecnicos['Ana Condori']
        self.assertEqual(ana['estado_actual'], 'en_trayecto')
        self.assertEqual(ana['ultima_lat'], -16.5)
        self.assertIsNotNone(ana['jornada_inicio'])

        beto = tecnicos['Beto Rojas']
        self.assertEqual(beto['estado_actual'], 'fuera_jornada')
        for campo in ['ultima_lat', 'ultima_lng', 'ultima_bateria', 'ultima_velocidad', 'ultima_actualizacion',
                      'jornada_inicio']:
            self.assertIsNone(beto[campo], campo)

    def test_solo_administradores(self):
        self.assertEqual(self.client.get('/api/v1/mapa-en-vivo').status_code, 401)
        tecnico = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(self.fuera)["access"]}'}
        self.assertEqual(self.client.get('/api/v1/mapa-en-vivo', **tecnico).status_code, 403)
