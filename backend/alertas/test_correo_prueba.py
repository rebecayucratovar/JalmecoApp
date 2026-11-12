"""POST /alertas/correo-prueba: envía un correo de prueba a los destinatarios de las alertas."""
from django.core import mail
from django.test import TestCase, override_settings

from core.models import Configuracion
from usuarios.autenticacion import emitir_tokens
from usuarios.models import Administrador


class CorreoPruebaTest(TestCase):
    def setUp(self):
        admin = Administrador.objects.create(nombre='Carla', email='carla@jalmeco.com.bo', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}

    def post(self):
        return self.client.post('/api/v1/alertas/correo-prueba', **self.auth).json()

    @override_settings(EMAIL_HOST='')
    def test_sin_servidor_de_correo(self):
        r = self.post()
        self.assertFalse(r['ok'])
        self.assertIn('EMAIL_', r['mensaje'])

    @override_settings(EMAIL_HOST='smtp.gmail.com', EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_envia_a_los_destinatarios(self):
        self.assertEqual(self.post(), {'ok': True, 'destinatarios': ['carla@jalmeco.com.bo']})  # vacío = admins
        Configuracion.objects.filter(pk=Configuracion.actual().pk).update(alertas_correos='sup@j.com')
        self.assertEqual(self.post()['destinatarios'], ['sup@j.com'])
        self.assertEqual(len(mail.outbox), 2)
        self.assertIn('Lo pidió Carla', mail.outbox[0].body)
