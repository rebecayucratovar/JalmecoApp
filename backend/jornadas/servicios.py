"""
Cierre automático de jornadas olvidadas: quien no marca la salida en Odoo seguiría "en jornada"
(y la app rastreándolo) toda la noche. Al pasar el fin del horario + `cierre_auto_horas`
(Configuración, 4 h por defecto: hay horas extra hasta las 21:00), se cierra.
"""
from datetime import datetime, timedelta

from django.db.models import Max
from django.utils import timezone

from alertas.models import Alerta
from core.models import Configuracion
from usuarios.models import Tecnico

from .models import Jornada

# Si entró DESPUÉS del fin del horario (p. ej. una emergencia a las 21:00), tiene al menos este plazo
PLAZO_FUERA_DE_HORARIO = timedelta(hours=4)


def limite_de(jornada, config):
    """
    (hora de cierre esperada, hasta cuándo puede seguir abierta sin marcar salida).
    Normal: fin del horario y fin del horario + `cierre_auto_horas`. Si entró después del horario:
    la entrada y + el mayor entre 4 h y `cierre_auto_horas`.
    """
    margen = timedelta(hours=config.cierre_auto_horas)
    dia = timezone.localtime(jornada.inicio).date()
    fin_horario = timezone.make_aware(datetime.combine(dia, config.horario_fin))
    if jornada.inicio >= fin_horario:
        return jornada.inicio, jornada.inicio + max(PLAZO_FUERA_DE_HORARIO, margen)
    return fin_horario, fin_horario + margen


def cerrar_olvidadas(ahora=None):
    """
    Cierra las jornadas abiertas que pasaron su límite y avisa al admin ("No marcó salida").
    La hora de cierre es el fin del horario, o el último punto GPS si siguió trabajando después.
    Devuelve cuántas cerró.
    """
    ahora = ahora or timezone.now()
    config = Configuracion.actual()
    cerradas = 0
    for jornada in Jornada.objects.filter(estado=Jornada.Estado.ACTIVA).select_related('tecnico'):
        fin_horario, limite = limite_de(jornada, config)
        if ahora < limite:
            continue
        # Se cierra al fin del horario (o a la entrada, si entró fuera de horario), salvo que haya
        # puntos GPS después: entonces al último, porque siguió trabajando.
        ultimo_punto = jornada.ubicaciones.aggregate(m=Max('registrado_en'))['m']
        fin = max(m for m in (jornada.inicio, fin_horario, ultimo_punto) if m is not None and m <= limite)
        jornada.fin, jornada.estado, jornada.cierre_automatico = fin, Jornada.Estado.CERRADA, True
        jornada.save(update_fields=['fin', 'estado', 'cierre_automatico'])
        if not Jornada.objects.filter(tecnico_id=jornada.tecnico_id, estado=Jornada.Estado.ACTIVA).exists():
            Tecnico.objects.filter(pk=jornada.tecnico_id).update(estado_actual=Tecnico.Estado.FUERA_JORNADA)
        entrada = timezone.localtime(jornada.inicio)
        Alerta.objects.create(
            tecnico=jornada.tecnico, tipo=Alerta.Tipo.SALIDA_NO_MARCADA, nivel=Alerta.Nivel.ADVERTENCIA,
            mensaje=(f'Entró el {entrada:%d/%m} a las {entrada:%H:%M} y no marcó salida en Odoo. '
                     f'Se cerró la jornada a las {timezone.localtime(jornada.fin):%H:%M} y se dejó de rastrear.'),
            creada_en=ahora,
        )
        cerradas += 1
    return cerradas
