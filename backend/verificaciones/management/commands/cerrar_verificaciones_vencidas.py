"""
Marca "no realizada" las verificaciones de huella vencidas y crea la alerta para el supervisor.

La ejecuta el worker cada minuto. Uso: python manage.py cerrar_verificaciones_vencidas
"""
from django.core.management.base import BaseCommand

from verificaciones import servicios


class Command(BaseCommand):
    help = 'Cierra las verificaciones de huella vencidas y genera sus alertas.'

    def handle(self, *args, **options):
        n = servicios.cerrar_vencidas()
        self.stdout.write(f'Verificaciones vencidas cerradas: {n}')
