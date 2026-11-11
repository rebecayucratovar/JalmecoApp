"""Alertas que calcula el worker: sin conexión y batería baja (solo en jornada)."""
from datetime import timedelta

from django.db.models import F
from django.utils import timezone

from core.models import Configuracion
from core.pausas import en_franja, fin_ultima_franja, franjas_activas
from jornadas.models import Jornada
from usuarios.models import Tecnico

from .models import Alerta


def _jornadas_activas():
    return Jornada.objects.filter(estado=Jornada.Estado.ACTIVA, tecnico__activo=True).select_related('tecnico')


def revisar_sin_conexion(ahora=None):
    """
    Marca "Sin conexión" a quien está en jornada y no envía datos hace `sin_conexion_min` minutos,
    y crea UNA alerta por cada corte. Devuelve cuántas alertas creó.

    El silencio se cuenta desde lo más reciente entre: el último punto, la entrada y el fin del
    almuerzo (en el almuerzo la app no envía nada a propósito, eso no es un corte).
    """
    ahora = ahora or timezone.now()
    franjas = franjas_activas()
    if en_franja(ahora, franjas):
        return 0
    umbral = timedelta(minutes=Configuracion.actual().sin_conexion_min)
    fin_pausa = fin_ultima_franja(ahora, franjas)

    creadas = 0
    for jornada in _jornadas_activas():
        t = jornada.tecnico
        desde = max(m for m in (t.ultima_actualizacion, jornada.inicio, fin_pausa) if m is not None)
        if ahora - desde < umbral:
            continue
        if t.estado_actual != Tecnico.Estado.SIN_CONEXION:
            # Solo si no llegó un punto entretanto (la recepción de puntos devuelve el estado)
            Tecnico.objects.filter(pk=t.pk, ultima_actualizacion=t.ultima_actualizacion).update(
                estado_actual=Tecnico.Estado.SIN_CONEXION)
        if Alerta.objects.filter(tecnico=t, tipo=Alerta.Tipo.SIN_CONEXION, creada_en__gte=desde).exists():
            continue  # este corte ya se avisó
        if t.ultima_actualizacion and t.ultima_actualizacion >= jornada.inicio:
            detalle = f'Sin datos del celular desde las {timezone.localtime(t.ultima_actualizacion):%H:%M}.'
        else:
            detalle = (f'Marcó entrada a las {timezone.localtime(jornada.inicio):%H:%M} '
                       'pero su celular no envía datos.')
        Alerta.objects.create(tecnico=t, tipo=Alerta.Tipo.SIN_CONEXION, nivel=Alerta.Nivel.ADVERTENCIA,
                              mensaje=detalle, creada_en=ahora)
        creadas += 1
    return creadas


def revisar_bateria(ahora=None):
    """Alerta "Batería baja" (una vez por jornada) cuando el último dato baja de `bateria_baja_pct`."""
    ahora = ahora or timezone.now()
    minimo = Configuracion.actual().bateria_baja_pct
    jornadas = _jornadas_activas().filter(
        tecnico__ultima_bateria__lte=minimo,
        tecnico__ultima_actualizacion__gte=F('inicio'),  # dato de ESTA jornada, no de ayer
    )
    creadas = 0
    for jornada in jornadas:
        t = jornada.tecnico
        if Alerta.objects.filter(tecnico=t, tipo=Alerta.Tipo.BATERIA_BAJA, creada_en__gte=jornada.inicio).exists():
            continue
        Alerta.objects.create(tecnico=t, tipo=Alerta.Tipo.BATERIA_BAJA, nivel=Alerta.Nivel.ADVERTENCIA,
                              mensaje=f'Batería del celular al {t.ultima_bateria} %.', creada_en=ahora)
        creadas += 1
    return creadas
