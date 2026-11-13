from django.contrib import admin

from .models import Alerta


@admin.register(Alerta)
class AlertaAdmin(admin.ModelAdmin):
    list_display = ['creada_en', 'tipo', 'nivel', 'tecnico', 'estado', 'notificada_en']
    list_filter = ['tipo', 'nivel', 'estado']
    search_fields = ['tecnico__nombre', 'tecnico__codigo', 'mensaje']
