from django.contrib import admin

from .models import Configuracion, FranjaPausa


@admin.register(Configuracion)
class ConfiguracionAdmin(admin.ModelAdmin):
    """Mientras no exista la pantalla de Configuración del panel web."""

    readonly_fields = ['odoo_ultima_sync_ok']
    fieldsets = [
        ('Horario y huella', {'fields': ['horario_inicio', 'horario_fin', 'verificaciones_por_dia',
                                         'verificacion_limite_min']}),
        ('Captura GPS', {'fields': ['gps_distancia_m', 'gps_intervalo_seg']}),
        ('Alertas', {'fields': ['sin_conexion_min', 'bateria_baja_pct', 'alertas_correos'],
                     'description': 'Correos separados por coma. Vacío = todos los administradores activos.'}),
        ('Odoo y retención', {'fields': ['odoo_sync_min', 'espejo_odoo_min', 'odoo_ultima_sync_ok',
                                         'retencion_meses']}),
    ]

    def has_add_permission(self, request):
        return not Configuracion.objects.exists()  # una sola fila

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FranjaPausa)
class FranjaPausaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'hora_inicio', 'hora_fin', 'activa']
