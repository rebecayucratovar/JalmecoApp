"""Sincronización con Odoo, con un Odoo falso en memoria (nunca se conecta al real)."""
from datetime import timedelta, timezone as tz
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from jornadas.models import Jornada
from usuarios.models import Tecnico

from . import servicios
from .cliente import ErrorOdoo
from .models import SincronizacionOdoo


def _odoo_txt(fecha):
    return fecha.astimezone(tz.utc).strftime('%Y-%m-%d %H:%M:%S')


class OdooFalso:
    """Imita lo que usa servicios.py de ClienteOdoo (sin filtrar dominios: devuelve todo)."""

    def __init__(self):
        self.empleados = {}
        self.usuarios = {}
        self.asistencias = {}

    def campos(self, modelo):
        return {'apellido_paterno': {}, 'apellido_materno': {}}

    def empleado(self, id, nombre, cargo='Técnico de mantenimiento', user=None, activo=True):
        self.empleados[id] = {'id': id, 'name': nombre, 'display_name': nombre, 'job_id': [1, cargo] if cargo else False, 'job_title': False,
                              'department_id': [2, 'MANTENIMIENTO'], 'company_id': [3, 'JALMECO LTDA'],
                              'user_id': [user, 'x'] if user else False, 'active': activo}

    def asistencia(self, id, empleado, entrada, salida=None):
        self.asistencias[id] = {'id': id, 'employee_id': [empleado, 'x'], 'check_in': _odoo_txt(entrada),
                                'check_out': _odoo_txt(salida) if salida else False,
                                'in_latitude': -16.5, 'in_longitude': -68.15, 'out_latitude': 0, 'out_longitude': 0}

    def buscar_leer(self, modelo, dominio, campos, limite=None, orden=None):
        if modelo == 'hr.employee':
            return [e for e in self.empleados.values() if e['active']]
        ids = next((d[2] for d in dominio if isinstance(d, tuple) and d[0] == 'id'), None)
        return [a for a in self.asistencias.values() if ids is None or a['id'] in ids]

    def ejecutar(self, modelo, metodo, ids, fields=None, context=None):
        if modelo == 'res.users':
            return [{'id': i, 'login': self.usuarios[i]} for i in ids if i in self.usuarios]
        return [self.empleados[i] for i in ids if i in self.empleados]


def _seg(fecha):
    return fecha.replace(microsecond=0)


class SincronizacionTest(TestCase):
    def setUp(self):
        self.odoo = OdooFalso()
        self.ahora = timezone.now()

    def test_usuario_generado(self):
        self.assertEqual(servicios.usuario_generado('José Ernesto Pereira Mamani'), 'jose.pereira')
        self.assertEqual(servicios.usuario_generado('ZULMA ROJAS'), 'zulma.rojas')
        self.assertEqual(servicios.usuario_generado('Asención'), 'asencion')
        self.assertEqual(servicios.usuario_generado('DAVID', 'HUAJLLIRE'), 'david.huajllire')

    def test_nombre_completo_con_apellidos_aparte(self):
        e = {'name': 'DAVID ', 'display_name': 'DAVID HUAJLLIRE LAIME', 'apellido_paterno': 'HUAJLLIRE',
             'apellido_materno': 'LAIME'}
        self.assertEqual(servicios.nombre_completo(e), 'DAVID HUAJLLIRE LAIME')
        self.assertEqual(servicios.nombre_completo({'name': 'Jose Pereira', 'apellido_paterno': 'Pereira'}),
                         'Jose Pereira')
        self.assertEqual(servicios.nombre_completo({
            'name': 'ING. JHENNY GARCIA AVILA', 'display_name': 'ING. JHENNY GARCIA AVILA GARCIA AVILA',
            'apellido_paterno': 'GARCIA', 'apellido_materno': 'AVILA'}), 'ING. JHENNY GARCIA AVILA')
        self.assertEqual(servicios.nombre_completo({'name': 'Ana', 'display_name': 'Ana Ríos'}), 'Ana Ríos')

    def test_importar_vincula_y_genera_usuarios(self):
        manual = Tecnico.objects.create(nombre='Ever Choque', usuario='JAL-0001', codigo='JAL-0001')
        Tecnico.objects.create(nombre='Otro', usuario='kevin.apaza')
        self.odoo.empleado(10, 'Kevin Apaza')
        self.odoo.empleado(11, 'EVER CHOQUE')
        self.odoo.empleado(12, 'Ana Mamani', user=5)
        self.odoo.usuarios[5] = 'ana.mamani@ejemplo.com'

        r = servicios.importar(self.odoo, [10, 11, 12])
        self.assertEqual((r['importados'], r['vinculados']), (2, 1))
        self.assertEqual(Tecnico.objects.get(odoo_employee_id=10).usuario, 'kevin.apaza2')  # el libre
        manual.refresh_from_db()
        self.assertEqual((manual.odoo_employee_id, manual.nombre, manual.usuario), (11, 'EVER CHOQUE', 'JAL-0001'))
        ana = Tecnico.objects.get(odoo_employee_id=12)
        self.assertEqual((ana.usuario, ana.usuario_de_odoo, ana.cargo, ana.pin_hash),
                         ('ana.mamani@ejemplo.com', True, 'Técnico de mantenimiento', None))

        # Al repetir no duplica; si se archiva en Odoo, se desactiva aquí
        self.assertEqual(servicios.importar(self.odoo, [10])['actualizados'], 1)
        self.odoo.empleados[10]['active'] = False
        self.odoo.empleados[12]['job_id'] = [9, 'Supervisor']
        self.assertEqual(servicios.actualizar_empleados(self.odoo), 2)
        self.assertFalse(Tecnico.objects.get(odoo_employee_id=10).activo)
        self.assertEqual(Tecnico.objects.get(odoo_employee_id=12).cargo, 'Supervisor')
        self.assertEqual(servicios.actualizar_empleados(self.odoo), 0)

    def test_asistencia_abre_corrige_y_cierra_jornadas(self):
        t = Tecnico.objects.create(nombre='Kevin', usuario='kevin', odoo_employee_id=10, ultima_lat=-16.4,
                                   ultima_lng=-68.1, ultima_actualizacion=self.ahora - timedelta(days=1))
        Tecnico.objects.create(nombre='Sin Odoo', usuario='otro')
        prueba = Jornada.objects.create(tecnico=t, inicio=self.ahora - timedelta(hours=3))  # de prueba, abierta
        entrada = self.ahora - timedelta(hours=1)
        self.odoo.asistencia(500, 10, entrada)
        self.odoo.asistencia(501, 10, self.ahora - timedelta(days=1, hours=8), self.ahora - timedelta(days=1))
        error = self.ahora - timedelta(hours=2)
        self.odoo.asistencia(502, 10, error, error + timedelta(seconds=14))  # marcación por error
        self.odoo.asistencia(503, 99, entrada)  # empleado no importado: se ignora
        self.odoo.asistencia(504, 10, self.ahora + timedelta(days=4))  # con fecha futura: se ignora
        vieja = self.ahora - timedelta(days=40)
        self.odoo.asistencia(505, 10, vieja, vieja + timedelta(hours=8))  # vieja: no se crea

        self.assertEqual(servicios.sincronizar_asistencias(self.odoo, self.ahora), 2)
        abierta = Jornada.objects.get(odoo_attendance_id=500)
        self.assertEqual((abierta.estado, _seg(abierta.inicio)), ('activa', _seg(entrada)))
        self.assertAlmostEqual(abierta.ubicacion_inicio.y, -16.5)
        self.assertFalse(Jornada.objects.filter(odoo_attendance_id=502).exists())
        prueba.refresh_from_db()
        self.assertEqual(prueba.estado, 'cerrada')
        t.refresh_from_db()
        self.assertEqual((t.estado_actual, t.ultima_lat), ('en_parada', None))  # nada de la posición de ayer

        self.assertEqual(servicios.sincronizar_asistencias(self.odoo, self.ahora), 0)  # idempotente

        # Marca la salida en Odoo → se cierra a esa hora
        salida = self.ahora - timedelta(minutes=5)
        self.odoo.asistencia(500, 10, entrada, salida)
        self.assertEqual(servicios.sincronizar_asistencias(self.odoo, self.ahora), 1)
        abierta.refresh_from_db()
        self.assertEqual((abierta.estado, _seg(abierta.fin)), ('cerrada', _seg(salida)))
        t.refresh_from_db()
        self.assertEqual(t.estado_actual, 'fuera_jornada')

    def test_asistencia_borrada_en_odoo(self):
        t = Tecnico.objects.create(nombre='Kevin', usuario='kevin', odoo_employee_id=10)
        self.odoo.asistencia(500, 10, self.ahora - timedelta(hours=1))
        servicios.sincronizar_asistencias(self.odoo, self.ahora)
        del self.odoo.asistencias[500]
        self.assertEqual(servicios.sincronizar_asistencias(self.odoo, self.ahora), 1)
        self.assertFalse(Jornada.objects.filter(tecnico=t).exists())  # vacía: se borra

    @override_settings(ODOO_URL='https://x', ODOO_DB='b', ODOO_USUARIO='u', ODOO_API_KEY='k')
    def test_tarea_registra_errores_sin_repetirlos(self):
        with mock.patch.object(servicios, 'ClienteOdoo', side_effect=ErrorOdoo('Tiempo agotado')):
            for _ in range(3):
                servicios._ultima_corrida.clear()
                with self.assertRaises(ErrorOdoo):
                    servicios.tarea_asistencia()
        self.assertEqual(SincronizacionOdoo.objects.filter(resultado='error').count(), 1)

    @override_settings(ODOO_USUARIO='')
    def test_tarea_sin_credenciales_no_hace_nada(self):
        self.assertIsNone(servicios.tarea_asistencia())
        self.assertFalse(SincronizacionOdoo.objects.exists())


class ImportarOdooPanelTest(TestCase):
    def setUp(self):
        from usuarios.autenticacion import emitir_tokens
        from usuarios.models import Administrador
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}
        self.odoo = OdooFalso()
        self.odoo.empleado(10, 'Kevin Apaza')
        self.odoo.empleado(11, 'Ana Mamani', user=5)
        self.odoo.usuarios[5] = 'ana@j.com'
        self.odoo.asistencia(500, 10, timezone.now() - timedelta(hours=1))
        parche = mock.patch('odoo_sync.views.ClienteOdoo', return_value=self.odoo)
        parche.start()
        self.addCleanup(parche.stop)

    def _json(self, metodo, url, datos=None):
        return getattr(self.client, metodo)(url, datos, content_type='application/json', **self.auth)

    def test_lista_importa_y_bloquea_lo_que_viene_de_odoo(self):
        r = self.client.get('/api/v1/odoo/empleados', **self.auth).json()
        self.assertEqual([e['nombre'] for e in r['empleados']], ['Ana Mamani', 'Kevin Apaza'])  # por nombre
        self.assertIsNone(r['empleados'][0]['tecnico_id'])

        r = self._json('post', '/api/v1/tecnicos/importar-odoo', {'odoo_ids': [10, 11]})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['importados'], 2)
        kevin = Tecnico.objects.get(odoo_employee_id=10)
        self.assertTrue(Jornada.objects.filter(tecnico=kevin, estado='activa').exists())  # ya marcó entrada

        # Usuario generado: editable. Usuario de Odoo y nombre: no.
        self.assertEqual(self._json('put', f'/api/v1/tecnicos/{kevin.pk}', {'usuario': 'kapaza'}).status_code, 200)
        ana = Tecnico.objects.get(odoo_employee_id=11)
        for campo, valor in (('usuario', 'ana'), ('nombre', 'Ana M.')):
            self.assertEqual(self._json('put', f'/api/v1/tecnicos/{ana.pk}', {campo: valor}).status_code, 400, campo)

    def test_error_de_odoo(self):
        with mock.patch('odoo_sync.views.ClienteOdoo', side_effect=ErrorOdoo('Usuario o clave API incorrectos')):
            r = self.client.get('/api/v1/odoo/empleados', **self.auth)
            self.assertEqual(r.status_code, 502)
            self.assertIn('clave API', r.json()['error'])
            self.assertFalse(self.client.post('/api/v1/odoo/sincronizar', **self.auth).json()['ok'])
