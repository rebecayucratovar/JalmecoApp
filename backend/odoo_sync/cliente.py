"""
Cliente mínimo de Odoo por XML-RPC (API externa oficial). Solo biblioteca estándar.

Se autentica con usuario + CLAVE API (no la contraseña). Docs:
https://www.odoo.com/documentation/17.0/developer/reference/external_api.html
"""
import xmlrpc.client

from django.conf import settings


class ErrorOdoo(Exception):
    """Error de conexión, credenciales o permisos al hablar con Odoo."""


class ClienteOdoo:
    def __init__(self, url=None, db=None, usuario=None, api_key=None, timeout=30):
        self.url = (url or settings.ODOO_URL).rstrip('/')
        self.db = db or settings.ODOO_DB
        self.usuario = usuario or settings.ODOO_USUARIO
        self._clave = api_key or settings.ODOO_API_KEY
        self.timeout = timeout
        self.uid = None
        faltan = [n for n, v in [('ODOO_URL', self.url), ('ODOO_DB', self.db),
                                 ('ODOO_USUARIO', self.usuario), ('ODOO_API_KEY', self._clave)] if not v]
        if faltan:
            raise ErrorOdoo(f'Faltan variables en backend/.env: {", ".join(faltan)}')

    def _proxy(self, ruta):
        transporte = _TransporteConTimeout(self.timeout, seguro=self.url.startswith('https'))
        return xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/{ruta}', allow_none=True, transport=transporte)

    def version(self):
        try:
            return self._proxy('common').version()
        except Exception as e:  # red, DNS, certificado…
            raise ErrorOdoo(f'No se pudo conectar con {self.url}: {e}') from e

    def autenticar(self):
        try:
            uid = self._proxy('common').authenticate(self.db, self.usuario, self._clave, {})
        except xmlrpc.client.Fault as e:
            raise ErrorOdoo(f'Odoo rechazó la autenticación: {e.faultString.strip().splitlines()[-1]}') from e
        except Exception as e:
            raise ErrorOdoo(f'No se pudo conectar con {self.url}: {e}') from e
        if not uid:
            raise ErrorOdoo('Usuario o clave API incorrectos (o la base de datos no se llama así).')
        self.uid = uid
        return uid

    def ejecutar(self, modelo, metodo, *args, **kwargs):
        if self.uid is None:
            self.autenticar()
        try:
            return self._proxy('object').execute_kw(self.db, self.uid, self._clave, modelo, metodo, list(args), kwargs)
        except xmlrpc.client.Fault as e:
            raise ErrorOdoo(f'{modelo}.{metodo}: {e.faultString.strip().splitlines()[-1]}') from e
        except Exception as e:
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
