"""
Prueba la conexión con Odoo y muestra qué datos hay (solo LECTURA, no cambia nada).

Uso: python manage.py probar_odoo

Sirve para decidir de dónde sale cada dato de Jalmeco GPS:
- ¿En qué campo del empleado está el código JAL-XXXX?
- ¿Tienen cargo (puesto de trabajo) cargado?
- ¿Se están registrando las asistencias (entrada/salida)?
"""
from django.core.management.base import BaseCommand, CommandError

from odoo_sync.cliente import ClienteOdoo, ErrorOdoo

# Campos de hr.employee donde podría estar el código del empleado (varía según la empresa)
CAMPOS_CODIGO = ['barcode', 'identification_id', 'registration_number', 'pin']
CAMPOS_EMPLEADO = ['name', 'job_id', 'job_title', 'department_id', 'user_id', 'work_email', 'mobile_phone']


class Command(BaseCommand):
    help = 'Prueba la conexión con Odoo (solo lectura) y muestra empleados y asistencias de ejemplo.'

    def add_arguments(self, parser):
        parser.add_argument('--muestras', type=int, default=3, help='Cuántos empleados/asistencias mostrar')

    def handle(self, *args, muestras, **options):
        try:
            odoo = ClienteOdoo()
            v = odoo.version()
            self._ok(f'Conectado a {odoo.url} · Odoo {v.get("server_version")}')
            uid = odoo.autenticar()
            self._ok(f'Autenticado como {odoo.usuario} (uid {uid}) en la base "{odoo.db}"')

            # ---- Empleados ----
            self._titulo('Empleados (hr.employee)')
            campos = odoo.campos('hr.employee')
            codigo = [c for c in CAMPOS_CODIGO if c in campos]
            personalizados = sorted(c for c in campos if c.startswith('x_'))
            leer = [c for c in CAMPOS_EMPLEADO + codigo if c in campos]
            total = odoo.contar('hr.employee', [('active', '=', True)])
            sin_cargo = odoo.contar('hr.employee', [('active', '=', True), ('job_id', '=', False)])
            self.stdout.write(f'Activos: {total} · sin puesto de trabajo (job_id): {sin_cargo}')
            self.stdout.write('Campos candidatos para el código JAL-XXXX: ' + ', '.join(
                f'{c} («{campos[c]["string"]}»)' for c in codigo))
            if personalizados:
                self.stdout.write('Campos personalizados (x_): ' + ', '.join(
                    f'{c} («{campos[c]["string"]}»)' for c in personalizados))
            for e in odoo.buscar_leer('hr.employee', [('active', '=', True)], leer + ['id'], limite=muestras):
                self.stdout.write(f'  · {self._fila(e)}')

            # ---- Asistencias ----
            self._titulo('Asistencias (hr.attendance)')
            total_a = odoo.contar('hr.attendance', [])
            abiertas = odoo.contar('hr.attendance', [('check_out', '=', False)])
            self.stdout.write(f'Registros: {total_a} · abiertas ahora (sin salida): {abiertas}')
            for a in odoo.buscar_leer('hr.attendance', [], ['employee_id', 'check_in', 'check_out'],
                                      limite=muestras, orden='check_in desc'):
                self.stdout.write(f'  · {self._fila(a)}  (horas en UTC)')

            # ---- Permisos de escritura (para el espejo de ubicación, Fase 2) ----
            self._titulo('Permisos del usuario de integración')
            for modelo in ['hr.employee', 'hr.attendance']:
                for op in ['read', 'write']:
                    ok = odoo.ejecutar(modelo, 'check_access_rights', op, raise_exception=False)
                    self.stdout.write(f'  {modelo:15} {op:5} {"sí" if ok else "NO"}')
        except ErrorOdoo as e:
            raise CommandError(str(e))

    def _fila(self, registro):
        partes = []
        for k, v in registro.items():
            if k == 'id' or v in (False, None, ''):
                continue
            if isinstance(v, list) and len(v) == 2:  # many2one: [id, "nombre"]
                v = v[1]
            partes.append(f'{k}={v}')
        return f'[{registro.get("id")}] ' + ' · '.join(partes)

    def _ok(self, texto):
        self.stdout.write(self.style.SUCCESS(f'✔ {texto}'))

    def _titulo(self, texto):
        self.stdout.write(self.style.MIGRATE_HEADING(f'\n{texto}'))
