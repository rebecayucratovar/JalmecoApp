"""Aviso de alertas por correo al administrador (lo corre el worker cada minuto)."""
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from core.models import Configuracion

from .models import Alerta

# Si una alerta quedó sin avisar más de esto (worker apagado, correo caído), ya no se envía:
# se marca como avisada para no mandar de golpe alertas viejas que ya no sirven.
VIGENCIA = timedelta(hours=6)


def enviar_pendientes(ahora=None):
    """
    Junta las alertas nuevas sin avisar en UN correo y las marca como avisadas.
    Devuelve cuántas avisó. Si el envío falla, lanza la excepción y se reintenta en la próxima vuelta.
    """
    ahora = ahora or timezone.now()
    sin_avisar = Alerta.objects.filter(notificada_en__isnull=True)
    sin_avisar.filter(creada_en__lt=ahora - VIGENCIA).update(notificada_en=ahora)  # viejas: sin correo
    alertas = list(sin_avisar.filter(estado=Alerta.Estado.NUEVA).select_related('tecnico').order_by('creada_en'))
    if not alertas:
        return 0

    destinatarios = Configuracion.actual().destinatarios_alertas()
    if not destinatarios:
        return 0  # nadie a quien avisar: quedan pendientes hasta que haya un correo configurado

    asunto, cuerpo = armar_correo(alertas)
    send_mail(asunto, cuerpo, None, destinatarios)  # None = DEFAULT_FROM_EMAIL
    Alerta.objects.filter(pk__in=[a.pk for a in alertas]).update(notificada_en=ahora)
    return len(alertas)


def enviar_prueba(admin):
    """Correo de prueba a los destinatarios de las alertas. Devuelve la lista de destinatarios."""
    destinatarios = Configuracion.actual().destinatarios_alertas()
    cuerpo = [
        'Este es un correo de prueba de Jalmeco GPS.',
        '',
        f'Lo pidió {admin.nombre} desde el panel ({timezone.localtime():%d/%m/%Y %H:%M}).',
        'Si te llegó, las alertas también te van a llegar a este correo.',
    ]
    if settings.PANEL_URL:
        cuerpo += ['', f'Panel: {settings.PANEL_URL.rstrip("/")}']
    send_mail('Jalmeco GPS · Correo de prueba', '\n'.join(cuerpo), None, destinatarios)
    return destinatarios


def armar_correo(alertas):
    criticas = [a for a in alertas if a.nivel == Alerta.Nivel.CRITICO]
    if len(alertas) == 1:
        a = alertas[0]
        asunto = f'Jalmeco GPS · {a.get_tipo_display()} — {a.tecnico.nombre}'
    else:
        asunto = f'Jalmeco GPS · {len(alertas)} alertas nuevas'
        if criticas:
            asunto += f' ({len(criticas)} críticas)'

    lineas = []
    for a in sorted(alertas, key=lambda x: (x.nivel != Alerta.Nivel.CRITICO, x.creada_en)):
        persona = a.tecnico.nombre + (f' ({a.tecnico.codigo})' if a.tecnico.codigo else '')
        marca = '[CRÍTICA] ' if a.nivel == Alerta.Nivel.CRITICO else ''
        lineas.append(f'• {timezone.localtime(a.creada_en):%H:%M} · {marca}{a.get_tipo_display()} — {persona}')
        if a.mensaje:
            lineas.append(f'  {a.mensaje}')
    if settings.PANEL_URL:
        lineas += ['', f'Ver en el panel: {settings.PANEL_URL.rstrip("/")}/alertas']
    lineas += ['', 'Este correo lo envía automáticamente Jalmeco GPS.']
    return asunto, '\n'.join(lineas)
