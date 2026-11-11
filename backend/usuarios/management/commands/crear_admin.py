"""
Crea un administrador del panel (equivalente a createsuperuser, para el modelo propio).

Uso: python manage.py crear_admin --email carla@jalmeco.com.bo --nombre "Carla Rojas" --password "••••"
     (sin --password, la pide por consola sin mostrarla)
"""
import getpass

from django.core.management.base import BaseCommand, CommandError

from usuarios.models import Administrador


class Command(BaseCommand):
    help = 'Crea un administrador del panel web.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--nombre', required=True)
        parser.add_argument('--password', help='Si se omite, se pide por consola.')

    def handle(self, *args, email, nombre, password, **options):
        if Administrador.objects.filter(email__iexact=email).exists():
            raise CommandError(f'Ya existe un administrador con el email {email}.')
        password = password or getpass.getpass('Contraseña: ')
        if len(password) < 8:
            raise CommandError('La contraseña debe tener al menos 8 caracteres.')

        admin = Administrador(email=email, nombre=nombre)
        admin.set_password(password)
        admin.save()
        self.stdout.write(self.style.SUCCESS(f'Administrador {admin.pk} creado: {admin}'))
