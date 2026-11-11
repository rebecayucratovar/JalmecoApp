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


from datetime import datetime  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

from django.contrib.gis.geos import Point  # noqa: E402

from ubicaciones.models import Ubicacion  # noqa: E402
from ubicaciones.recorrido import Punto, calcular_paradas, distancia_m, distancia_total_m, limpiar  # noqa: E402

LA_PAZ = ZoneInfo('America/La_Paz')


def lp(h, m=0):
    return datetime(2026, 11, 10, h, m, tzinfo=LA_PAZ)


# ~111 m por cada 0.001° de latitud
def p(h, m, lat, lng=-68.1):
    return Punto(lat=lat, lng=lng, hora=lp(h, m))


class ParadasTest(TestCase):
    def test_distancia(self):
        self.assertAlmostEqual(distancia_m(p(8, 0, -16.500), p(8, 0, -16.501)), 111, delta=1)

    def test_parada_de_al_menos_5_min_dentro_de_100_m(self):
        puntos = [p(8, 0, -16.500), p(8, 2, -16.5003), p(8, 4, -16.4998), p(8, 6, -16.5002),  # quieto 6 min
                  p(8, 8, -16.505), p(8, 9, -16.510),  # se va
                  p(8, 10, -16.520), p(8, 12, -16.5201)]  # 2 min: no alcanza
        paradas = calcular_paradas(puntos)
        self.assertEqual(len(paradas), 1)
        self.assertEqual((paradas[0]['inicio'], paradas[0]['fin'], paradas[0]['duracion_min']), (lp(8), lp(8, 6), 6))

    def test_limpia_picos_saltos_imposibles_y_duplicados(self):
        puntos = [p(8, 0, -16.500), p(8, 1, -16.506), p(8, 2, -16.5001),  # pico de 650 m que vuelve
                  p(8, 2, -16.5001),  # duplicado
                  p(8, 3, -16.600),  # 11 km en 1 min: imposible
                  p(8, 5, -16.503)]  # movimiento real
        self.assertEqual([x.hora for x in limpiar(puntos)], [lp(8), lp(8, 2), lp(8, 5)])

    def test_un_hueco_largo_corta_la_parada_y_la_distancia(self):
        # Mismo lugar antes y después del almuerzo: dos paradas, no una de 3 horas
        puntos = [p(11, 30, -16.5), p(11, 36, -16.5), p(13, 0, -16.5), p(13, 10, -16.5)]
        self.assertEqual(len(calcular_paradas(puntos)), 2)
        # Un salto de 1 km a través de un hueco de 1 h no se suma
        self.assertEqual(distancia_total_m([p(11, 0, -16.50), p(12, 0, -16.51)]), 0)


class RecorridoEndpointTest(TestCase):
    def setUp(self):
        admin = Administrador.objects.create(nombre='Ana', email='ana@jalmeco.com', password_hash='x')
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {emitir_tokens(admin)["access"]}'}
        self.t = Tecnico.objects.create(usuario='juan', nombre='Juan')
        j = Jornada.objects.create(tecnico=self.t, inicio=lp(8), fin=lp(17), estado=Jornada.Estado.CERRADA)
        for h, m, lat, prec in [(8, 5, -16.500, 10), (8, 15, -16.500, 10), (8, 30, -16.510, 10), (9, 30, -16.6, 900)]:
            Ubicacion.objects.create(tecnico=self.t, jornada=j, punto=Point(-68.1, lat), precision_m=prec,
                                     registrado_en=lp(h, m))
        # Otra jornada de otro día: no aparece
        otra = Jornada.objects.create(tecnico=self.t, inicio=lp(8) + timedelta(days=1))
        Ubicacion.objects.create(tecnico=self.t, jornada=otra, punto=Point(-68.1, -16.5), registrado_en=lp(9) + timedelta(days=1))

    def test_recorrido_del_dia(self):
        r = self.client.get(f'/api/v1/tecnicos/{self.t.pk}/recorrido?fecha=2026-11-10', **self.auth)
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(len(d['jornadas']), 1)
        self.assertEqual(len(d['puntos']), 3)  # el de precisión 900 m se descarta
        self.assertEqual(d['resumen']['paradas'], 1)
        self.assertEqual(d['resumen']['en_jornada_min'], 8 * 60)  # 9 h menos 1 h de almuerzo
        self.assertEqual([x['nombre'] for x in d['pausas']], ['Almuerzo'])
        self.assertGreater(d['resumen']['distancia_km'], 1)

    def test_dia_sin_jornada_y_fecha_invalida(self):
        r = self.client.get(f'/api/v1/tecnicos/{self.t.pk}/recorrido?fecha=2026-11-01', **self.auth)
        self.assertEqual((r.json()['jornadas'], r.json()['puntos'], r.json()['pausas']), ([], [], []))
        r = self.client.get(f'/api/v1/tecnicos/{self.t.pk}/recorrido?fecha=ayer', **self.auth)
        self.assertEqual(r.status_code, 400)
