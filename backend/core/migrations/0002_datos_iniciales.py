import datetime

from django.db import migrations


def crear_datos_iniciales(apps, schema_editor):
    FranjaPausa = apps.get_model('core', 'FranjaPausa')
    Configuracion = apps.get_model('core', 'Configuracion')

    # Franja de privacidad: sin rastreo de 12:00 a 13:00 (hora America/La_Paz)
    FranjaPausa.objects.get_or_create(
        nombre='Almuerzo',
        defaults={
            'hora_inicio': datetime.time(12, 0),
            'hora_fin': datetime.time(13, 0),
            'activa': True,
        },
    )

    # Una sola fila de configuración con los valores por defecto del modelo
    if not Configuracion.objects.exists():
        Configuracion.objects.create()


def borrar_datos_iniciales(apps, schema_editor):
    apps.get_model('core', 'FranjaPausa').objects.filter(nombre='Almuerzo').delete()
    apps.get_model('core', 'Configuracion').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear_datos_iniciales, borrar_datos_iniciales),
    ]
