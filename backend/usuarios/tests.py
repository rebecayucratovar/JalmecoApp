"""Panel admin: personal (lista, alta, edición, PIN) y revocación de sesiones al reiniciar el PIN."""
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from jornadas.models import Jornada

from .autenticacion import emitir_tokens
from .models import Administrador, Tecnico
from .panel import generar_pin


class Base(TestCase):
    def setUp(self):
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}

    def pedir(self, metodo, ruta, datos=None, auth=None):
        return getattr(self.client, metodo)(f'/api/v1/{ruta}', datos, content_type='application/json',
                                            **(self.auth if auth is None else auth))


class ListaYFichaTest(Base):
    def test_lista_con_estado_y_privacidad(self):
        en = Tecnico.objects.create(usuario='a', nombre='Ana Condori', ultima_lat=-16.5, ultima_lng=-68.1,
                                    estado_actual=Tecnico.Estado.EN_PARADA)
        Tecnico.objects.create(usuario='b', nombre='Beto Rojas', ultima_lat=-16.5, ultima_lng=-68.1, activo=False)
        Jornada.objects.create(tecnico=en, inicio=timezone.now())
        r = self.pedir('get', 'tecnicos')
        self.assertEqual(r.status_code, 200)
        ana, beto = r.json()['tecnicos']
        self.assertEqual((ana['estado_actual'], ana['ultima_lat'], ana['tiene_pin']), ('en_parada', -16.5, False))
        self.assertEqual((beto['estado_actual'], beto['ultima_lat'], beto['activo']), ('fuera_jornada', None, False))

    def test_ficha_404_y_solo_admin(self):
        self.assertEqual(self.pedir('get', 'tecnicos/999').status_code, 404)
        t = Tecnico.objects.create(usuario='a', nombre='Ana')
        tecnico = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(t)["access"]}'}
        self.assertEqual(self.pedir('get', 'tecnicos', auth=tecnico).status_code, 403)


class AltaYEdicionTest(Base):
    def test_alta_normaliza_y_usa_el_codigo_como_usuario(self):
        r = self.pedir('post', 'tecnicos', {'nombre': '  Juan   Mamani ', 'codigo': 'jal-1021',
                                            'celular_numero': '712 45830', 'celular_modelo': 'Samsung A15'})
        self.assertEqual(r.status_code, 201, r.json())
        t = Tecnico.objects.get()
        self.assertEqual((t.nombre, t.codigo, t.usuario, t.celular_numero), ('Juan Mamani', 'JAL-1021', 'JAL-1021', '+591 71245830'))
        self.assertFalse(t.tiene_pin)

    def test_validaciones(self):
        Tecnico.objects.create(usuario='jmamani', nombre='Juan', codigo='JAL-1021')
        casos = [
            ({'nombre': 'Luis'}, 'usuario'),  # sin usuario ni código
            ({'nombre': 'Luis', 'codigo': 'JAL-12'}, 'codigo'),
            ({'nombre': 'Luis', 'usuario': 'JMAMANI'}, 'usuario'),  # repetido (sin importar mayúsculas)
            ({'nombre': 'Luis', 'usuario': 'jal-1021'}, 'usuario'),  # choca con el CÓDIGO de otro
            ({'nombre': 'Luis', 'usuario': 'luis', 'celular_numero': '2245678'}, 'celular_numero'),
            ({'nombre': 'Luis', 'usuario': 'luis choque'}, 'usuario'),
        ]
        for datos, campo in casos:
            r = self.pedir('post', 'tecnicos', datos)
            self.assertEqual(r.status_code, 400, datos)
            self.assertIn(campo, r.json()['detalle'], datos)

    def test_edicion_parcial_y_datos_de_odoo(self):
        t = Tecnico.objects.create(usuario='jal-1021', nombre='Juan', codigo='JAL-1021')
        r = self.pedir('put', f'tecnicos/{t.pk}', {'celular_modelo': 'Motorola G54', 'activo': False})
        self.assertEqual(r.status_code, 200)
        t.refresh_from_db()
        self.assertEqual((t.celular_modelo, t.activo, t.nombre), ('Motorola G54', False, 'Juan'))

        Tecnico.objects.filter(pk=t.pk).update(odoo_employee_id=55)
        r = self.pedir('put', f'tecnicos/{t.pk}', {'nombre': 'Otro nombre'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('Odoo', r.json()['detalle']['nombre'][0])
        # Lo que no viene de Odoo sí se puede cambiar
        self.assertEqual(self.pedir('put', f'tecnicos/{t.pk}', {'celular_numero': '+591 71245830'}).status_code, 200)


class PinTest(Base):
    def test_genera_pin_que_permite_entrar(self):
        t = Tecnico.objects.create(usuario='juan', nombre='Juan')
        r = self.pedir('post', f'tecnicos/{t.pk}/pin')
        self.assertEqual(r.status_code, 200)
        pin = r.json()['pin']
        self.assertRegex(pin, r'^\d{6}$')
        login = self.client.post('/api/v1/auth/tecnico/login', {'usuario': 'juan', 'pin': pin},
                                 content_type='application/json')
        self.assertEqual(login.status_code, 200)

    def test_reiniciar_pin_cierra_las_sesiones_anteriores(self):
        t = Tecnico.objects.create(usuario='juan', nombre='Juan')
        t.set_pin('480213')
        t.save()
        tokens = emitir_tokens(t)
        sesion = {'HTTP_AUTHORIZATION': f'Bearer {tokens["access"]}'}
        self.assertEqual(self.pedir('get', 'mi/perfil', auth=sesion).status_code, 200)

        # El reinicio ocurre después de emitir los tokens
        with mock.patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=5)):
            self.pedir('post', f'tecnicos/{t.pk}/pin')
        r = self.pedir('get', 'mi/perfil', auth=sesion)
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()['codigo'], 'SESION_REVOCADA')
        renovar = self.client.post('/api/v1/auth/refresh', {'refresh': tokens['refresh']},
                                   content_type='application/json')
        self.assertEqual(renovar.status_code, 401)

    def test_pines_no_triviales(self):
        for _ in range(300):
            pin = generar_pin()
            self.assertNotIn(pin, {'000000', '111111', '123456', '654321', '234567'})
            self.assertEqual(len(pin), 6)


class MiCuentaTest(TestCase):
    """Datos del administrador y cambio de contraseña (cierra las demás sesiones)."""

    def setUp(self):
        from rest_framework_simplejwt.tokens import AccessToken
        self.admin = Administrador(nombre='Ana', email='ana@jalmeco.com')
        self.admin.set_password('ClaveVieja2026')
        self.admin.password_cambiado_en = None
        self.admin.save()
        Administrador.objects.create(nombre='Otro', email='otro@jalmeco.com', password_hash='x')
        # Sesión abierta hace un minuto (antes del cambio de contraseña)
        token = AccessToken()
        token['uid'], token['tipo'] = self.admin.pk, 'admin'
        token['iat'] = int(timezone.now().timestamp()) - 60
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

    def test_lee_y_edita_datos(self):
        self.assertEqual(self.client.get('/api/v1/mi-cuenta', **self.auth).json()['email'], 'ana@jalmeco.com')
        r = self.client.put('/api/v1/mi-cuenta', {'nombre': '  Ana  María ', 'email': 'ANA.M@jalmeco.com'},
                            content_type='application/json', **self.auth)
        self.assertEqual(r.json(), {'id': self.admin.pk, 'nombre': 'Ana María', 'email': 'ana.m@jalmeco.com'})
        r = self.client.put('/api/v1/mi-cuenta', {'email': 'otro@jalmeco.com'}, content_type='application/json', **self.auth)
        self.assertEqual(set(r.json()['detalle']), {'email'})

    def test_cambio_de_password(self):
        def cambiar(actual, nueva):
            return self.client.post('/api/v1/mi-cuenta/password', {'actual': actual, 'nueva': nueva},
                                    content_type='application/json', **self.auth)
        self.assertEqual(set(cambiar('mal', 'OtraClave2026!').json()['detalle']), {'actual'})
        self.assertEqual(set(cambiar('ClaveVieja2026', '123').json()['detalle']), {'nueva'})
        self.assertEqual(set(cambiar('ClaveVieja2026', 'ClaveVieja2026').json()['detalle']), {'nueva'})

        r = cambiar('ClaveVieja2026', 'Ascensor-Norte-77')
        self.assertEqual(r.status_code, 200, r.content)
        nuevo = r.json()['access']
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password('Ascensor-Norte-77'))
        # Las sesiones anteriores al cambio dejan de valer; esta sigue con el token nuevo
        viejo = self.client.get('/api/v1/mi-cuenta', **self.auth)
        self.assertEqual((viejo.status_code, viejo.json()['codigo']), (401, 'SESION_REVOCADA'))
        self.assertIn('contraseña', viejo.json()['error'])
        self.assertEqual(self.client.get('/api/v1/mi-cuenta', HTTP_AUTHORIZATION=f'Bearer {nuevo}').status_code, 200)
