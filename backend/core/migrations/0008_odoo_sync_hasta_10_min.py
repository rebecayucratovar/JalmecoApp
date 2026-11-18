import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    """La asistencia de Odoo se puede leer cada 1 a 10 min (antes 1–2)."""

    dependencies = [
        ('core', '0007_cierre_auto_horas'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='configuracion',
            name='configuracion_odoo_sync_min_rango',
        ),
        migrations.AlterField(
            model_name='configuracion',
            name='odoo_sync_min',
            field=models.IntegerField(default=2, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(10)]),
        ),
        migrations.AddConstraint(
            model_name='configuracion',
            constraint=models.CheckConstraint(condition=models.Q(('odoo_sync_min__gte', 1), ('odoo_sync_min__lte', 10)), name='configuracion_odoo_sync_min_rango'),
        ),
    ]
