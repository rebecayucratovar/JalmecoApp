"""
[DEV / TEMPORAL] Cierra la jornada activa de un técnico.

En producción las jornadas las cierra el worker de Odoo (hr.attendance). BORRAR cuando exista.

Uso: python manage.py cerrar_jornada <tecnico_id>
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from jornadas.models import Jornada
from usuarios.models import Tecnico


class Command(BaseCommand):
    help = '[DEV/TEMPORAL] Cierra la jornada activa del técnico indicado (reemplaza a Odoo).'

    def add_arguments(self, parser):
        parser.add_argument('tecnico_id', type=int)

    def handle(self, *args, tecnico_id, **options):
        if not settings.DEBUG:
            raise CommandError('Comando solo para desarrollo (DEBUG=True).')
        jornada = Jornada.objects.filter(tecnico_id=tecnico_id, estado=Jornada.Estado.ACTIVA).first()
        if jornada is None:
            raise CommandError(f'El técnico {tecnico_id} no tiene jornada activa.')

        jornada.fin = timezone.now()
        jornada.estado = Jornada.Estado.CERRADA
        jornada.save(update_fields=['fin', 'estado'])
        Tecnico.objects.filter(pk=tecnico_id).update(estado_actual=Tecnico.Estado.FUERA_JORNADA)

        duracion = int((jornada.fin - jornada.inicio).total_seconds() // 60)
        self.stdout.write(self.style.SUCCESS(f'[DEV] Jornada {jornada.pk} cerrada ({duracion} min).'))
