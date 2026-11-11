from django.test import TestCase, override_settings

from .models import SincronizacionOdoo


class EstadoOdooPanelTest(TestCase):
    def setUp(self):
        from usuarios.autenticacion import emitir_tokens
        from usuarios.models import Administrador
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}

    @override_settings(ODOO_URL='https://jalmeco.odoo.com', ODOO_DB='base', ODOO_USUARIO='', ODOO_API_KEY='secreta')
    def test_estado_sin_clave_y_con_faltantes(self):
        SincronizacionOdoo.registrar(SincronizacionOdoo.Tipo.ASISTENCIA, error='Tiempo agotado')
        r = self.client.get('/api/v1/odoo/estado', **self.auth).json()
        self.assertEqual(r['faltan'], ['ODOO_USUARIO'])
        self.assertNotIn('secreta', str(r))
        self.assertEqual(r['historial'][0]['mensaje'], 'Tiempo agotado')
        # Probar con datos incompletos: responde el motivo, sin conectarse
        r = self.client.post('/api/v1/odoo/probar', **self.auth).json()
        self.assertFalse(r['ok'])
        self.assertIn('ODOO_USUARIO', r['mensaje'])
