"""
[DEV] Pide ahora una verificación de huella a un técnico en jornada (para probar la app).

En producción las solicita el worker en momentos aleatorios (~2 por jornada).

Uso: python manage.py solicitar_verificacion <tecnico_id>
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from usuarios.models import Tecnico
from verificaciones import servicios


class Command(BaseCommand):
    help = '[DEV] Crea una solicitud de huella para el técnico indicado (debe estar en jornada).'

    def add_arguments(self, parser):
        parser.add_argument('tecnico_id', type=int)

    def handle(self, *args, tecnico_id, **options):
        if not settings.DEBUG:
            raise CommandError('Comando solo para desarrollo (DEBUG=True).')
        tecnico = Tecnico.objects.filter(pk=tecnico_id).first()
        if tecnico is None:
            raise CommandError(f'No existe el técnico {tecnico_id}.')
        v = servicios.solicitar(tecnico)
        if v is None:
            raise CommandError('El técnico no tiene una jornada activa (usa abrir_jornada).')
        vence = timezone.localtime(v.solicitada_en + servicios.limite())
        self.stdout.write(self.style.SUCCESS(
            f'[DEV] Verificación {v.pk} solicitada a {tecnico}. Vence a las {vence:%H:%M:%S}.'
        ))
