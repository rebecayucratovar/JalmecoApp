"""
[DEV / TEMPORAL] Crea un técnico de prueba con PIN.

En producción los técnicos se importan de Odoo y el PIN lo genera el panel
(POST /tecnicos/{id}/pin). Este comando es solo para probar la API.

Uso: python manage.py crear_tecnico --usuario jmartinez --nombre "Juan Martínez" --pin 292317 [--codigo JAL-1047]
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from usuarios.models import Tecnico


class Command(BaseCommand):
    help = '[DEV/TEMPORAL] Crea un técnico de prueba con PIN de 6 dígitos.'

    def add_arguments(self, parser):
        parser.add_argument('--usuario', required=True)
        parser.add_argument('--nombre', required=True)
        parser.add_argument('--pin', required=True, help='6 dígitos')
        parser.add_argument('--codigo', help='Formato JAL-XXXX')
        parser.add_argument('--cargo')

    def handle(self, *args, usuario, nombre, pin, codigo, cargo, **options):
        if not settings.DEBUG:
            raise CommandError('Comando solo para desarrollo (DEBUG=True).')
        if Tecnico.objects.filter(usuario=usuario).exists():
            raise CommandError(f'Ya existe un técnico con usuario {usuario}.')

        tecnico = Tecnico(usuario=usuario, nombre=nombre, codigo=codigo, cargo=cargo)
        try:
            tecnico.set_pin(pin)
        except ValueError as e:
            raise CommandError(str(e))
        tecnico.full_clean()  # valida p. ej. el formato JAL-XXXX
        tecnico.save()
        self.stdout.write(self.style.SUCCESS(f'[DEV] Técnico {tecnico.pk} creado: {tecnico}'))
