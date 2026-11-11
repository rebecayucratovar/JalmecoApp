"""Franjas de pausa (privacidad): se comparan siempre en hora local America/La_Paz."""
from django.utils import timezone

from .models import FranjaPausa


def franjas_activas():
    return list(FranjaPausa.objects.filter(activa=True).order_by('hora_inicio'))


def en_franja(momento, franjas):
    """True si el datetime `momento` cae dentro de alguna franja (inicio incluido, fin excluido)."""
    hora = timezone.localtime(momento).time()  # zona por defecto: America/La_Paz
    for f in franjas:
        if f.hora_inicio <= f.hora_fin:
            if f.hora_inicio <= hora < f.hora_fin:
                return True
        elif hora >= f.hora_inicio or hora < f.hora_fin:  # franja que cruza la medianoche
            return True
    return False


def franja_almuerzo(franjas):
    """La franja llamada "Almuerzo" (o la primera activa si no hay una con ese nombre)."""
    for f in franjas:
        if f.nombre.strip().lower() == 'almuerzo':
            return f
    return franjas[0] if franjas else None
