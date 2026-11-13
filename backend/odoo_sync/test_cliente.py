"""Cliente de Odoo: un solo inicio de sesión por proceso y pausa ante bloqueos (sin red real)."""
import xmlrpc.client
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from . import cliente, servicios
from .cliente import ClienteOdoo, ErrorOdoo
from .models import SincronizacionOdoo

DATOS = dict(ODOO_URL='https://x.odoo.com', ODOO_DB='b', ODOO_USUARIO='u', ODOO_API_KEY='k')


class ProxyFalso:
    """Cuenta los inicios de sesión y las consultas."""

    inicios = 0
    consultas = 0
    error = None

    def __init__(self, url, **kwargs):
        self.url = url

    def authenticate(self, *args):
        if ProxyFalso.error:
            raise ProxyFalso.error
        ProxyFalso.inicios += 1
        return 7

    def execute_kw(self, *args):
        if ProxyFalso.error:
            raise ProxyFalso.error
        ProxyFalso.consultas += 1
        return []


@override_settings(**DATOS)
class UnSoloInicioTest(SimpleTestCase):
    def setUp(self):
        cliente._UIDS.clear()
        ProxyFalso.inicios = ProxyFalso.consultas = 0
        ProxyFalso.error = None
        parche = mock.patch.object(cliente.xmlrpc.client, 'ServerProxy', ProxyFalso)
        parche.start()
        self.addCleanup(parche.stop)

    def test_reutiliza_el_uid_entre_clientes(self):
        for _ in range(5):  # como 5 vueltas del worker
            ClienteOdoo().buscar_leer('hr.attendance', [], ['id'])
        self.assertEqual((ProxyFalso.inicios, ProxyFalso.consultas), (1, 5))

    def test_otra_clave_inicia_sesion_de_nuevo(self):
        ClienteOdoo().buscar_leer('hr.attendance', [], ['id'])
        ClienteOdoo(api_key='otra').buscar_leer('hr.attendance', [], ['id'])
        self.assertEqual(ProxyFalso.inicios, 2)

    def test_403_es_bloqueo(self):
        ProxyFalso.error = xmlrpc.client.ProtocolError('x.odoo.com/xmlrpc/2/common', 403, 'FORBIDDEN', {})
        with self.assertRaises(ErrorOdoo) as e:
            ClienteOdoo().autenticar()
        self.assertTrue(e.exception.bloqueo)
        self.assertIn('403', str(e.exception))


@override_settings(**DATOS)
class PausaPorBloqueoTest(TestCase):
    def setUp(self):
        servicios._pausa_hasta = None
        servicios._ultima_corrida.clear()
        self.addCleanup(setattr, servicios, '_pausa_hasta', None)

    def test_tras_un_403_no_vuelve_a_intentar_por_1_hora(self):
        llamadas = []

        def falla(odoo):
            llamadas.append(1)
            raise ErrorOdoo('Odoo rechazó el acceso (HTTP 403).', bloqueo=True)

        with mock.patch.object(servicios, 'ClienteOdoo'):
            with self.assertRaises(ErrorOdoo):
                servicios._tarea(SincronizacionOdoo.Tipo.ASISTENCIA, falla)
            self.assertIsNone(servicios._tarea(SincronizacionOdoo.Tipo.ASISTENCIA, falla))
            self.assertIsNone(servicios._tarea(SincronizacionOdoo.Tipo.EMPLEADOS, falla))
            self.assertEqual(len(llamadas), 1)
            # Pasada la hora, vuelve a intentar
            servicios._pausa_hasta = timezone.now()
            with self.assertRaises(ErrorOdoo):
                servicios._tarea(SincronizacionOdoo.Tipo.ASISTENCIA, falla)
        self.assertEqual(len(llamadas), 2)
