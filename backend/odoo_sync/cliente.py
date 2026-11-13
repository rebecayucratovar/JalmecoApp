"""
Cliente mínimo de Odoo por XML-RPC (API externa oficial). Solo biblioteca estándar.

Se autentica con usuario + CLAVE API (no la contraseña). Docs:
https://www.odoo.com/documentation/17.0/developer/reference/external_api.html

La API no mantiene una sesión abierta: `authenticate` solo devuelve el número de usuario (uid) y
cada consulta lleva la clave. Por eso el uid se guarda en memoria y se reutiliza: se inicia sesión
una vez por proceso, no en cada sincronización (Odoo registra cada inicio de sesión).
"""
import hashlib
import xmlrpc.client

from django.conf import settings

# uid por (servidor, base, usuario, clave): dura lo que dure el proceso (worker o backend)
_UIDS = {}
# Respuestas HTTP de Odoo.sh que indican bloqueo o exceso de pedidos: no insistir
CODIGOS_BLOQUEO = {403, 429}


class ErrorOdoo(Exception):
    """Error de conexión, credenciales o permisos al hablar con Odoo."""

    def __init__(self, mensaje, bloqueo=False):
        super().__init__(mensaje)
        self.bloqueo = bloqueo  # Odoo rechazó el acceso (403/429): pausar, no reintentar enseguida


def _error_de_red(url, e):
    if isinstance(e, xmlrpc.client.ProtocolError) and e.errcode in CODIGOS_BLOQUEO:
        return ErrorOdoo(f'Odoo rechazó el acceso (HTTP {e.errcode}). La sincronización se pausa un rato.',
                         bloqueo=True)
    return ErrorOdoo(f'No se pudo conectar con {url}: {e}')


class ClienteOdoo:
    def __init__(self, url=None, db=None, usuario=None, api_key=None, timeout=30):
        self.url = (url or settings.ODOO_URL).rstrip('/')
        self.db = db or settings.ODOO_DB
        self.usuario = usuario or settings.ODOO_USUARIO
        self._clave = api_key or settings.ODOO_API_KEY
        self.timeout = timeout
        faltan = [n for n, v in [('ODOO_URL', self.url), ('ODOO_DB', self.db),
                                 ('ODOO_USUARIO', self.usuario), ('ODOO_API_KEY', self._clave)] if not v]
        if faltan:
            raise ErrorOdoo(f'Faltan variables en backend/.env: {", ".join(faltan)}')
        huella = hashlib.sha256(self._clave.encode()).hexdigest()  # no guardar la clave como clave del dict
        self._llave = (self.url, self.db, self.usuario, huella)
        self.uid = _UIDS.get(self._llave)

    def _proxy(self, ruta):
        transporte = _TransporteConTimeout(self.timeout, seguro=self.url.startswith('https'))
        return xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/{ruta}', allow_none=True, transport=transporte)

    def version(self):
        try:
            return self._proxy('common').version()
        except Exception as e:  # red, DNS, certificado…
            raise _error_de_red(self.url, e) from e

    def autenticar(self):
        try:
            uid = self._proxy('common').authenticate(self.db, self.usuario, self._clave, {})
        except xmlrpc.client.Fault as e:
            raise ErrorOdoo(f'Odoo rechazó la autenticación: {e.faultString.strip().splitlines()[-1]}') from e
        except Exception as e:
            raise _error_de_red(self.url, e) from e
        if not uid:
            _UIDS.pop(self._llave, None)
            raise ErrorOdoo('Usuario o clave API incorrectos (o la base de datos no se llama así).')
        self.uid = _UIDS[self._llave] = uid
        return uid

    def ejecutar(self, modelo, metodo, *args, **kwargs):
        if self.uid is None:
            self.autenticar()
        try:
            return self._proxy('object').execute_kw(self.db, self.uid, self._clave, modelo, metodo, list(args), kwargs)
        except xmlrpc.client.Fault as e:
            if 'AccessDenied' in e.faultString or 'Access Denied' in e.faultString:
                # La clave se revocó o cambió: la próxima vez se vuelve a iniciar sesión
                _UIDS.pop(self._llave, None)
                self.uid = None
            raise ErrorOdoo(f'{modelo}.{metodo}: {e.faultString.strip().splitlines()[-1]}') from e
        except Exception as e:
            if isinstance(e, xmlrpc.client.ProtocolError) and e.errcode in CODIGOS_BLOQUEO:
                raise _error_de_red(self.url, e) from e
            raise ErrorOdoo(f'{modelo}.{metodo}: {e}') from e

    def buscar_leer(self, modelo, dominio, campos, limite=None, orden=None):
        kwargs = {'fields': campos}
        if limite:
            kwargs['limit'] = limite
        if orden:
            kwargs['order'] = orden
        return self.ejecutar(modelo, 'search_read', dominio, **kwargs)

    def contar(self, modelo, dominio):
        return self.ejecutar(modelo, 'search_count', dominio)

    def campos(self, modelo):
        return self.ejecutar(modelo, 'fields_get', attributes=['string', 'type'])


class _TransporteConTimeout(xmlrpc.client.SafeTransport):
    """Para que una caída de Odoo no deje colgado al worker."""

    def __init__(self, timeout, seguro=True):
        super().__init__()
        self._timeout = timeout
        self._seguro = seguro

    def make_connection(self, host):
        if self._seguro:
            conexion = super().make_connection(host)
        else:
            conexion = xmlrpc.client.Transport.make_connection(self, host)
        conexion.timeout = self._timeout
        return conexion
