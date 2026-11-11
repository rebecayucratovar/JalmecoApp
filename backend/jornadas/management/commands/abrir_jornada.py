"""
[DEV / TEMPORAL] Abre una jornada de prueba para un técnico.

En producción las jornadas las abre el worker de Odoo (hr.attendance). Este comando existe
solo para probar el envío de puntos mientras ese worker no exista. BORRAR cuando esté listo.

Uso: python manage.py abrir_jornada <tecnico_id>
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from jornadas.models import Jornada
from usuarios.models import Tecnico


class Command(BaseCommand):
    help = '[DEV/TEMPORAL] Abre una jornada de prueba para el técnico indicado (reemplaza a Odoo).'

    def add_arguments(self, parser):
        parser.add_argument('tecnico_id', type=int)

    def handle(self, *args, tecnico_id, **options):
        if not settings.DEBUG:
            raise CommandError('Comando solo para desarrollo (DEBUG=True).')
        tecnico = Tecnico.objects.filter(pk=tecnico_id).first()
        if tecnico is None:
            raise CommandError(f'No existe el técnico {tecnico_id}.')
        abierta = Jornada.objects.filter(tecnico=tecnico, estado=Jornada.Estado.ACTIVA).first()
        if abierta:
            raise CommandError(f'El técnico ya tiene la jornada {abierta.pk} activa desde {abierta.inicio}.')

        jornada = Jornada.objects.create(tecnico=tecnico, inicio=timezone.now())
        self.stdout.write(self.style.SUCCESS(
            f'[DEV] Jornada {jornada.pk} abierta para {tecnico} a las {timezone.localtime(jornada.inicio):%H:%M:%S}.'
        ))
