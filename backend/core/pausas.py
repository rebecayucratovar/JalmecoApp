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


def almuerzo_configurado():
    """La franja del almuerzo que se edita desde Configuración (la activa o, si no hay, la de ese nombre)."""
    return franja_almuerzo(franjas_activas())         or FranjaPausa.objects.filter(nombre__iexact='almuerzo').order_by('id').first()


# ---- Ayudas de "hora del día" (para el worker) ----

def hoy_a_las(momento, hora):
    """El mismo día local (La Paz) que `momento`, a la hora `hora` (datetime con zona)."""
    local = timezone.localtime(momento)
    return local.replace(hour=hora.hour, minute=hora.minute, second=0, microsecond=0)


def _franjas_del_dia(momento, franjas):
    """(inicio, fin) de cada franja en el día local de `momento` (se ignoran las que cruzan la medianoche)."""
    return [(hoy_a_las(momento, f.hora_inicio), hoy_a_las(momento, f.hora_fin))
            for f in franjas if f.hora_inicio < f.hora_fin]


def minutos_utiles(desde, hasta, franjas):
    """Minutos entre `desde` y `hasta` sin contar las franjas de pausa (0 si hasta ≤ desde)."""
    if hasta <= desde:
        return 0
    total = (hasta - desde).total_seconds()
    for ini, fin in _franjas_del_dia(desde, franjas):
        solape = (min(hasta, fin) - max(desde, ini)).total_seconds()
        if solape > 0:
            total -= solape
    return max(0, int(total // 60))


def fin_ultima_franja(momento, franjas):
    """Cuándo terminó hoy la última franja ya pasada (p. ej. 13:00 tras el almuerzo), o None."""
    fines = [fin for _, fin in _franjas_del_dia(momento, franjas) if fin <= momento]
    return max(fines) if fines else None
