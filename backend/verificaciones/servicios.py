"""Reglas de la verificación por huella (las usan las vistas, los comandos y el worker)."""
import random
from datetime import time, timedelta

from django.db import transaction
from django.utils import timezone

from alertas.models import Alerta
from core.models import Configuracion
from core.pausas import en_franja, franjas_activas, hoy_a_las, minutos_utiles
from jornadas.models import Jornada
from usuarios.models import Tecnico

from .models import Verificacion


def limite():
    """Tiempo para responder (configuración: verificacion_limite_min)."""
    return timedelta(minutes=Configuracion.actual().verificacion_limite_min)


def segundos_restantes(verificacion, ahora=None, plazo=None):
    """Segundos que le quedan a una verificación pendiente (None si no está pendiente o venció).

    La app arma la cuenta regresiva con este número (y no con el reloj del celular).
    """
    if verificacion is None or verificacion.resultado != Verificacion.Resultado.PENDIENTE:
        return None
    ahora = ahora or timezone.now()
    restantes = int((verificacion.solicitada_en + (plazo or limite()) - ahora).total_seconds())
    return restantes if restantes > 0 else None


def solicitar(tecnico, jornada=None, ahora=None):
    """Crea una solicitud de huella para la jornada activa del técnico (None si no está en jornada)."""
    jornada = jornada or Jornada.objects.filter(tecnico=tecnico, estado=Jornada.Estado.ACTIVA).first()
    if jornada is None:
        return None
    return Verificacion.objects.create(tecnico=tecnico, jornada=jornada, solicitada_en=ahora or timezone.now())


# Reglas del sorteo
SEPARACION = timedelta(minutes=60)  # entre una huella y la siguiente
MARGEN_ENTRADA = timedelta(minutes=10)  # no pedirla apenas marca la entrada


def programar(ahora=None, azar=random.random, paso_min=1):
    """
    Sortea las huellas del día (la corre el worker cada `paso_min` minutos). Devuelve cuántas pidió.

    Para cada persona en jornada: si hoy le faltan k huellas y quedan r minutos útiles hasta el
    fin del horario (sin contar el almuerzo), se pide una ahora con probabilidad k·paso/r. Así
    salen en momentos al azar y repartidas, y al acercarse el fin del horario la probabilidad
    llega a 1 (se cumplen las del día). Si trabaja después del horario y aún no tuvo ninguna,
    se pide igual (mínimo 1 al día).
    """
    ahora = ahora or timezone.now()
    franjas = franjas_activas()
    if en_franja(ahora, franjas):
        return 0  # en el almuerzo nunca
    config = Configuracion.actual()
    por_dia = config.verificaciones_por_dia
    if por_dia <= 0:
        return 0
    inicio_dia = hoy_a_las(ahora, time(0, 0))
    restantes = minutos_utiles(ahora, hoy_a_las(ahora, config.horario_fin), franjas)

    pedidas = 0
    jornadas = (Jornada.objects.filter(estado=Jornada.Estado.ACTIVA, tecnico__activo=True)
                .exclude(tecnico__estado_actual=Tecnico.Estado.SIN_CONEXION)  # ya hay alerta de eso
                .select_related('tecnico'))
    for jornada in jornadas:
        if ahora - jornada.inicio < MARGEN_ENTRADA:
            continue
        hoy = list(Verificacion.objects.filter(tecnico=jornada.tecnico, solicitada_en__gte=inicio_dia)
                   .order_by('-solicitada_en')[:por_dia])
        if any(v.resultado == Verificacion.Resultado.PENDIENTE for v in hoy):
            continue
        if hoy and ahora - hoy[0].solicitada_en < SEPARACION:
            continue
        faltan = por_dia - len(hoy)
        if faltan <= 0:
            continue
        if restantes <= 0:
            toca = not hoy  # fuera del horario: solo asegura el mínimo de 1
        else:
            toca = azar() < faltan * paso_min / restantes
        if toca and solicitar(jornada.tecnico, jornada, ahora):
            pedidas += 1
    return pedidas


def cerrar_vencidas(tecnico=None, ahora=None):
    """
    Marca `no_realizada` las verificaciones pendientes cuyo plazo venció y crea la alerta
    `verificacion_no_realizada` para el supervisor. Devuelve cuántas cerró.

    La corre el worker cada minuto; mi/estado también la llama para el técnico que consulta.
    """
    ahora = ahora or timezone.now()
    plazo = limite()
    vencidas = Verificacion.objects.filter(
        resultado=Verificacion.Resultado.PENDIENTE, solicitada_en__lte=ahora - plazo,
    )
    if tecnico is not None:
        vencidas = vencidas.filter(tecnico=tecnico)

    cerradas = 0
    for v in vencidas.select_related('tecnico'):
        with transaction.atomic():
            # Solo una vez aunque corran a la vez el worker y mi/estado
            actualizadas = Verificacion.objects.filter(
                pk=v.pk, resultado=Verificacion.Resultado.PENDIENTE,
            ).update(resultado=Verificacion.Resultado.NO_REALIZADA)
            if not actualizadas:
                continue
            hora = timezone.localtime(v.solicitada_en).strftime('%H:%M')
            Alerta.objects.create(
                tecnico=v.tecnico, tipo=Alerta.Tipo.VERIFICACION_NO_REALIZADA, nivel=Alerta.Nivel.CRITICO,
                mensaje=f'No confirmó su identidad con la huella (solicitada a las {hora}).',
            )
            cerradas += 1
    return cerradas
