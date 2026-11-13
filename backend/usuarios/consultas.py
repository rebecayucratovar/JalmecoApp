"""Consultas de técnicos que usan varias pantallas del panel."""
from django.db.models import Exists, OuterRef, Subquery

from jornadas.models import Jornada

from .models import Tecnico


def con_jornada(queryset=None):
    """Agrega `en_jornada` y `jornada_inicio` (de la jornada activa) a cada técnico."""
    activa = Jornada.objects.filter(tecnico=OuterRef('pk'), estado=Jornada.Estado.ACTIVA)
    return (queryset if queryset is not None else Tecnico.objects.all()).annotate(
        en_jornada=Exists(activa),
        jornada_inicio=Subquery(activa.order_by('-inicio').values('inicio')[:1]),
    )
