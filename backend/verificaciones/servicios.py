"""Reglas de la verificación por huella (las usan las vistas, los comandos y el worker)."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from alertas.models import Alerta
from core.models import Configuracion
from jornadas.models import Jornada

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


def solicitar(tecnico):
    """Crea una solicitud de huella para la jornada activa del técnico (None si no está en jornada)."""
    jornada = Jornada.objects.filter(tecnico=tecnico, estado=Jornada.Estado.ACTIVA).first()
    if jornada is None:
        return None
    return Verificacion.objects.create(tecnico=tecnico, jornada=jornada)


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
