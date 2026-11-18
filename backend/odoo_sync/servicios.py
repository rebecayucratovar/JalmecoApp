"""
Sincronización con Odoo (solo LECTURA de Odoo; lo que cambia es nuestra base).

- Empleados (hr.employee): el admin elige a quién importar (Odoo tiene ex empleados sin archivar y
  otras empresas). De los ya importados se mantienen al día el nombre, el cargo y el usuario; si se
  archivan en Odoo, se desactivan aquí.
- Asistencia (hr.attendance) → jornadas: la entrada abre la jornada y la salida la cierra. Solo de
  los empleados importados. Idempotente: se puede correr las veces que haga falta.

Las horas de Odoo vienen en UTC y sin zona ("2026-11-11 22:16:28").
"""
import re
import unicodedata
from datetime import datetime, timedelta, timezone as tz

from django.conf import settings
from django.contrib.gis.geos import Point
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.models import Configuracion
from jornadas.models import Jornada
from usuarios.models import Tecnico

from .cliente import ClienteOdoo, ErrorOdoo
from .models import SincronizacionOdoo

CAMPOS_EMPLEADO = ['name', 'display_name', 'job_id', 'job_title', 'department_id', 'company_id', 'user_id',
                   'active']
# Del módulo del partner: `name` trae solo los nombres; los apellidos van aparte
APELLIDOS = ['apellido_paterno', 'apellido_materno']
CAMPOS_ASISTENCIA = ['employee_id', 'check_in', 'check_out', 'in_latitude', 'in_longitude',
                     'out_latitude', 'out_longitude']
VENTANA_ASISTENCIA = timedelta(days=2)  # siempre se repasan las asistencias de los últimos 2 días
MARGEN_CURSOR = timedelta(minutes=10)  # + las modificadas desde la última sincronización (correcciones)
MARCA_MINIMA = timedelta(minutes=1)  # entrada y salida en segundos = marcación por error: se ignora
TOLERANCIA_FUTURO = timedelta(minutes=5)  # entradas con hora futura (de prueba / reloj mal): se ignoran


def configurado():
    return all([settings.ODOO_URL, settings.ODOO_DB, settings.ODOO_USUARIO, settings.ODOO_API_KEY])


# ---------- utilidades ----------

def _fecha(valor):
    """'2026-11-11 22:16:28' (UTC) → datetime con zona. False/None → None."""
    if not valor:
        return None
    return datetime.strptime(valor, '%Y-%m-%d %H:%M:%S').replace(tzinfo=tz.utc)


def _texto_odoo(fecha):
    return fecha.astimezone(tz.utc).strftime('%Y-%m-%d %H:%M:%S')


def _nombre_m2o(valor):
    """Campo many2one de Odoo: [id, "nombre"] o False."""
    return valor[1].strip() if valor else None


def _punto(lat, lng):
    # Odoo guarda 0 cuando el navegador no dio la ubicación
    if not lat or not lng:
        return None
    return Point(lng, lat, srid=4326)


def _sin_tildes(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')


def nombre_normalizado(nombre):
    return ' '.join(_sin_tildes(nombre or '').lower().split())


def _campos_empleado(odoo):
    """Los campos a leer (+ los apellidos, si esta base de Odoo los tiene)."""
    if not hasattr(odoo, '_campos_empleado'):
        disponibles = odoo.campos('hr.employee')
        odoo._campos_empleado = CAMPOS_EMPLEADO + [c for c in APELLIDOS if c in disponibles]
    return odoo._campos_empleado


def nombre_completo(empleado):
    """Nombres + apellidos. En esta base `name` trae solo los nombres ("DAVID")."""
    nombre = ' '.join((empleado.get('name') or '').split())
    apellidos = ' '.join(' '.join(a.split()) for a in (empleado.get(c) for c in APELLIDOS) if a)
    if apellidos:
        # Algunos ya tienen los apellidos en `name` (y display_name los repetiría)
        return nombre if apellidos.lower() in nombre.lower() else f'{nombre} {apellidos}'[:160]
    completo = ' '.join((empleado.get('display_name') or '').split())
    return completo if completo.lower().startswith(nombre.lower()) and len(completo) <= 160 else nombre


def _cargo(empleado):
    """El puesto de trabajo (job_id); si no tiene, el título del puesto."""
    return _nombre_m2o(empleado.get('job_id')) or (empleado.get('job_title') or '').strip() or None


def _usuario_libre(base, excluir_pk=None):
    """`base`, o `base2`, `base3`… el primero que nadie use como usuario ni como código."""
    otros = Tecnico.objects.exclude(pk=excluir_pk) if excluir_pk else Tecnico.objects.all()
    candidato, n = base, 1
    while otros.filter(Q(usuario__iexact=candidato) | Q(codigo__iexact=candidato)).exists():
        n += 1
        candidato = f'{base}{n}'
    return candidato


def _palabras(texto):
    return [p for p in (re.sub(r'[^a-z0-9]', '', p) for p in nombre_normalizado(texto).split()) if p]


def usuario_generado(nombre, apellido_paterno=None):
    """
    Para quien no tiene usuario en Odoo: primer nombre + apellido paterno ("david.huajllire").
    Sin el apellido aparte: "José Ernesto Pereira Mamani" → "jose.pereira" (con 2–3 palabras, la última).
    """
    partes = _palabras(nombre)
    if not partes:
        return 'usuario'
    apellido = _palabras(apellido_paterno or '')
    if apellido:
        return f'{partes[0]}.{apellido[0]}'
    if len(partes) == 1:
        return partes[0]
    ultimo = partes[2] if len(partes) >= 4 else partes[-1]
    return f'{partes[0]}.{ultimo}'


def _logins(odoo, empleados):
    """{user_id: login} de los usuarios de Odoo de esos empleados."""
    ids = sorted({e['user_id'][0] for e in empleados if e.get('user_id')})
    if not ids:
        return {}
    return {u['id']: u['login'].strip() for u in odoo.ejecutar('res.users', 'read', ids, fields=['login'])
            if u.get('login')}


# ---------- empleados ----------

def empleados_odoo(odoo):
    """Empleados ACTIVOS de Odoo, para elegir a quién importar (el panel filtra por empresa, etc.)."""
    empleados = odoo.buscar_leer('hr.employee', [('active', '=', True)], _campos_empleado(odoo), orden='name')
    logins = _logins(odoo, empleados)
    vinculados = dict(Tecnico.objects.filter(odoo_employee_id__isnull=False)
                      .values_list('odoo_employee_id', 'id'))
    return [{
        'odoo_id': e['id'],
        'nombre': nombre_completo(e),
        'cargo': _cargo(e),
        'departamento': _nombre_m2o(e.get('department_id')),
        'empresa': _nombre_m2o(e.get('company_id')),
        'usuario_odoo': logins.get(e['user_id'][0]) if e.get('user_id') else None,
        'tecnico_id': vinculados.get(e['id']),
    } for e in sorted(empleados, key=lambda e: nombre_normalizado(nombre_completo(e)))]


def _aplicar_empleado(tecnico, empleado, login):
    """Copia de Odoo nombre, cargo y usuario. Devuelve los campos que cambiaron."""
    cambios = []
    nombre = nombre_completo(empleado)
    if tecnico.nombre != nombre:
        tecnico.nombre = nombre
        cambios.append('nombre')
    if tecnico.cargo != _cargo(empleado):
        tecnico.cargo = _cargo(empleado)
        cambios.append('cargo')
    if login:
        if tecnico.usuario != login or not tecnico.usuario_de_odoo:
            usado = Tecnico.objects.exclude(pk=tecnico.pk).filter(
                Q(usuario__iexact=login) | Q(codigo__iexact=login)).exists()
            if not usado:
                tecnico.usuario, tecnico.usuario_de_odoo = login, True
                cambios += ['usuario', 'usuario_de_odoo']
    elif tecnico.usuario_de_odoo:
        # Le quitaron el usuario en Odoo: queda el que tenía, pero ya se puede editar aquí
        tecnico.usuario_de_odoo = False
        cambios.append('usuario_de_odoo')
    return cambios


def importar(odoo, odoo_ids):
    """
    Crea (o actualiza) en Jalmeco GPS a los empleados elegidos. A quien ya existía cargado a mano
    con el mismo nombre se lo vincula en vez de duplicarlo. Quedan "Sin PIN".
    """
    odoo_ids = sorted({int(i) for i in odoo_ids})
    empleados = odoo.ejecutar('hr.employee', 'read', odoo_ids, fields=_campos_empleado(odoo))
    logins = _logins(odoo, empleados)
    resultado = {'importados': 0, 'actualizados': 0, 'vinculados': 0, 'nombres': []}

    with transaction.atomic():
        for e in empleados:
            login = logins.get(e['user_id'][0]) if e.get('user_id') else None
            tecnico = Tecnico.objects.filter(odoo_employee_id=e['id']).first()
            tipo = 'actualizados'
            if tecnico is None:
                buscado = nombre_normalizado(nombre_completo(e))
                iguales = [t for t in Tecnico.objects.filter(odoo_employee_id__isnull=True)
                           if nombre_normalizado(t.nombre) == buscado]
                if len(iguales) == 1:
                    tecnico, tipo = iguales[0], 'vinculados'
                    tecnico.odoo_employee_id = e['id']
                else:
                    tipo = 'importados'
                    tecnico = Tecnico(odoo_employee_id=e['id'], nombre=nombre_completo(e), usuario=_usuario_libre(
                        usuario_generado(e['name'], e.get('apellido_paterno'))))
            _aplicar_empleado(tecnico, e, login)
            tecnico.save()
            resultado[tipo] += 1
            if tipo != 'actualizados':
                resultado['nombres'].append(tecnico.nombre)
    return resultado


def actualizar_empleados(odoo):
    """
    Pone al día a los ya importados (nombre, cargo, usuario). Si un empleado se archivó en Odoo
    (dejó la empresa), se desactiva aquí: ya no puede entrar a la app. Devuelve cuántos cambiaron.
    """
    vinculados = {t.odoo_employee_id: t for t in Tecnico.objects.filter(odoo_employee_id__isnull=False)}
    if not vinculados:
        return 0
    empleados = odoo.ejecutar('hr.employee', 'read', sorted(vinculados), fields=_campos_empleado(odoo),
                              context={'active_test': False})
    logins = _logins(odoo, empleados)
    cambiados = 0
    for e in empleados:
        tecnico = vinculados[e['id']]
        cambios = _aplicar_empleado(tecnico, e, logins.get(e['user_id'][0]) if e.get('user_id') else None)
        if not e.get('active', True) and tecnico.activo:
            tecnico.activo = False
            cambios.append('activo')
        if cambios:
            tecnico.save(update_fields=cambios)
            cambiados += 1
    return cambiados


# ---------- asistencia → jornadas ----------

def _limpiar_estado_en_vivo(tecnico_id, estado):
    """Al entrar o salir: el último punto es de la jornada anterior, no se muestra en el mapa."""
    Tecnico.objects.filter(pk=tecnico_id).update(
        estado_actual=estado, ultima_lat=None, ultima_lng=None, ultima_velocidad=None,
        ultima_bateria=None, ultima_actualizacion=None,
    )


def _se_puede_borrar(jornada):
    return not jornada.ubicaciones.exists() and not jornada.verificaciones.exists()


def _cerrar(jornada, fin):
    jornada.fin, jornada.estado = fin, Jornada.Estado.CERRADA
    jornada.save(update_fields=['fin', 'estado'])
    if not Jornada.objects.filter(tecnico_id=jornada.tecnico_id, estado=Jornada.Estado.ACTIVA).exists():
        Tecnico.objects.filter(pk=jornada.tecnico_id).update(estado_actual=Tecnico.Estado.FUERA_JORNADA)


def _aplicar_asistencia(a, tecnico_id, ahora):
    """
    Crea o corrige la jornada de una asistencia. Devuelve True si cambió algo.
    Solo CREA jornadas de los últimos 2 días (o abiertas): una asistencia vieja que se corrigió en
    Odoo actualiza su jornada si ya existía, pero no trae meses de historial sin recorrido.
    """
    inicio, fin = _fecha(a['check_in']), _fecha(a['check_out'])
    if inicio > ahora + TOLERANCIA_FUTURO:
        return False
    jornada = Jornada.objects.filter(odoo_attendance_id=a['id']).first()
    if jornada is None and fin and inicio < ahora - VENTANA_ASISTENCIA:
        return False

    if fin and fin - inicio < MARCA_MINIMA:  # entrada y salida al toque: marcación por error
        if jornada and _se_puede_borrar(jornada):
            jornada.delete()
            return True
        if jornada is None:
            return False

    estado = Jornada.Estado.CERRADA if fin else Jornada.Estado.ACTIVA
    if jornada is None:
        if estado == Jornada.Estado.ACTIVA:
            # Odoo no deja 2 entradas abiertas: si aquí quedó otra activa (p. ej. de prueba), se cierra
            for otra in Jornada.objects.filter(tecnico_id=tecnico_id, estado=Jornada.Estado.ACTIVA):
                _cerrar(otra, max(otra.inicio, inicio))
        Jornada.objects.create(
            tecnico_id=tecnico_id, odoo_attendance_id=a['id'], inicio=inicio, fin=fin, estado=estado,
            ubicacion_inicio=_punto(a.get('in_latitude'), a.get('in_longitude')),
            ubicacion_fin=_punto(a.get('out_latitude'), a.get('out_longitude')) if fin else None,
        )
        if estado == Jornada.Estado.ACTIVA:
            _limpiar_estado_en_vivo(tecnico_id, Tecnico.Estado.EN_PARADA)
        return True

    cambios = []
    if jornada.inicio != inicio:
        jornada.inicio = inicio
        cambios.append('inicio')
    if jornada.ubicacion_inicio is None and _punto(a.get('in_latitude'), a.get('in_longitude')):
        jornada.ubicacion_inicio = _punto(a['in_latitude'], a['in_longitude'])
        cambios.append('ubicacion_inicio')
    if fin and jornada.ubicacion_fin is None and _punto(a.get('out_latitude'), a.get('out_longitude')):
        jornada.ubicacion_fin = _punto(a['out_latitude'], a['out_longitude'])
        cambios.append('ubicacion_fin')
    if cambios:
        jornada.save(update_fields=cambios)
    if jornada.cierre_automatico:
        # La cerró el sistema (no marcó salida a tiempo): no se reabre. Si después marca la salida en
        # Odoo, vale la de Odoo, antes O DESPUÉS de nuestro cierre (horas extra: las horas del día
        # cuentan bien; el recorrido igual dejó de registrarse al cerrarla).
        if fin and fin != jornada.fin:
            jornada.fin = fin
            jornada.save(update_fields=['fin'])
            cambios.append('fin')
        return bool(cambios)
    if jornada.fin != fin or jornada.estado != estado:
        if fin:
            _cerrar(jornada, fin)
        else:  # le borraron la salida en Odoo: se reabre
            jornada.fin, jornada.estado = None, estado
            jornada.save(update_fields=['fin', 'estado'])
        cambios.append('fin')
    return bool(cambios)


def sincronizar_asistencias(odoo, ahora=None):
    """
    Trae de Odoo las asistencias de los empleados importados: las abiertas, las de los últimos
    2 días y las modificadas desde la última sincronización. Devuelve cuántas jornadas cambiaron.
    """
    ahora = ahora or timezone.now()
    vinculados = dict(Tecnico.objects.filter(odoo_employee_id__isnull=False)
                      .values_list('odoo_employee_id', 'id'))
    if not vinculados:
        return 0
    ultima = Configuracion.actual().odoo_ultima_sync_ok
    desde = ahora - VENTANA_ASISTENCIA
    modificadas = min(ultima - MARGEN_CURSOR, desde) if ultima else desde
    dominio = [('employee_id', 'in', sorted(vinculados)),
               '|', '|', ('check_out', '=', False), ('check_in', '>=', _texto_odoo(desde)),
               ('write_date', '>=', _texto_odoo(modificadas))]
    asistencias = odoo.buscar_leer('hr.attendance', dominio, CAMPOS_ASISTENCIA, orden='check_in')

    cambiadas = 0
    with transaction.atomic():
        for a in asistencias:
            tecnico_id = vinculados.get(a['employee_id'][0] if a.get('employee_id') else None)
            if tecnico_id and _aplicar_asistencia(a, tecnico_id, ahora):
                cambiadas += 1

        # Jornadas abiertas que no vinieron arriba: su asistencia se cerró (sin pasar por la ventana)
        # o la borraron en Odoo (se borra aquí si está vacía; si no, se cierra ahora)
        vistas = {a['id'] for a in asistencias}
        abiertas = list(Jornada.objects.filter(estado=Jornada.Estado.ACTIVA, odoo_attendance_id__isnull=False)
                        .exclude(odoo_attendance_id__in=vistas))
        if abiertas:
            en_odoo = {a['id']: a for a in odoo.buscar_leer(
                'hr.attendance', [('id', 'in', [j.odoo_attendance_id for j in abiertas])], CAMPOS_ASISTENCIA)}
            for jornada in abiertas:
                a = en_odoo.get(jornada.odoo_attendance_id)
                if a is not None:
                    tecnico_id = vinculados.get(a['employee_id'][0] if a.get('employee_id') else None)
                    if tecnico_id == jornada.tecnico_id and _aplicar_asistencia(a, tecnico_id, ahora):
                        cambiadas += 1
                    continue
                if _se_puede_borrar(jornada):
                    jornada.delete()
                    if not Jornada.objects.filter(tecnico_id=jornada.tecnico_id,
                                                  estado=Jornada.Estado.ACTIVA).exists():
                        Tecnico.objects.filter(pk=jornada.tecnico_id).update(
                            estado_actual=Tecnico.Estado.FUERA_JORNADA)
                else:
                    _cerrar(jornada, ahora)
                cambiadas += 1
    return cambiadas


# ---------- tareas del worker ----------

_ultima_corrida = {}
PAUSA_POR_BLOQUEO = timedelta(hours=1)
_pausa_hasta = None  # si Odoo respondió 403/429, el worker no vuelve a intentar hasta esta hora


def pausada_hasta():
    return _pausa_hasta if _pausa_hasta and timezone.now() < _pausa_hasta else None


def _tarea(tipo, funcion, cada_min=None):
    """
    Corre `funcion(odoo)` y lo anota en el historial. Sin datos de Odoo en .env: no hace nada.
    Si Odoo bloquea (403/429), todas las tareas de Odoo se pausan 1 h en vez de insistir.
    """
    global _pausa_hasta
    if not configurado() or pausada_hasta():
        return None
    if cada_min:
        ahora = timezone.now()
        anterior = _ultima_corrida.get(tipo)
        if anterior and ahora - anterior < timedelta(minutes=cada_min) - timedelta(seconds=10):
            return None
        _ultima_corrida[tipo] = ahora
    try:
        registros = funcion(ClienteOdoo())
    except ErrorOdoo as e:
        if e.bloqueo:
            _pausa_hasta = timezone.now() + PAUSA_POR_BLOQUEO
        SincronizacionOdoo.registrar(tipo, error=e)
        raise
    SincronizacionOdoo.registrar(tipo, registros=registros)
    return registros


def tarea_asistencia():
    """Cada `odoo_sync_min` (1–2 min). El worker la llama cada minuto."""
    return _tarea(SincronizacionOdoo.Tipo.ASISTENCIA, sincronizar_asistencias,
                  cada_min=Configuracion.actual().odoo_sync_min)


def tarea_asistencia_ahora(odoo):
    """Lo mismo, a pedido del panel (con un cliente ya abierto). Los errores los maneja quien llama."""
    try:
        registros = sincronizar_asistencias(odoo)
    except ErrorOdoo as e:
        SincronizacionOdoo.registrar(SincronizacionOdoo.Tipo.ASISTENCIA, error=e)
        raise
    SincronizacionOdoo.registrar(SincronizacionOdoo.Tipo.ASISTENCIA, registros=registros)
    _ultima_corrida[SincronizacionOdoo.Tipo.ASISTENCIA] = timezone.now()
    return registros


def tarea_empleados():
    return _tarea(SincronizacionOdoo.Tipo.EMPLEADOS, actualizar_empleados)
