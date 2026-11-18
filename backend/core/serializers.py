"""Configuración del sistema para el panel (pantalla Configuración)."""
import re

from django.conf import settings
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as ErrorDjango
from rest_framework import serializers

from .models import Configuracion
from .pausas import almuerzo_configurado

HORA = '%H:%M'
MAX_CORREOS = 10


class AlmuerzoSerializer(serializers.Serializer):
    inicio = serializers.TimeField(format=HORA)
    fin = serializers.TimeField(format=HORA)

    def validate(self, datos):
        if datos['inicio'] >= datos['fin']:
            raise serializers.ValidationError('El almuerzo debe terminar después de empezar.')
        return datos


def _rango(minimo, maximo):
    return {'min_value': minimo, 'max_value': maximo}


class ConfiguracionSerializer(serializers.ModelSerializer):
    """
    Lectura y edición (parcial) de la única fila de `configuracion` más el horario del almuerzo
    (la franja de pausa "Almuerzo"). `alertas_destinatarios` es solo lectura: a quién llegan hoy.
    """

    horario_inicio = serializers.TimeField(format=HORA)
    horario_fin = serializers.TimeField(format=HORA)
    cierre_auto_horas = serializers.IntegerField(**_rango(1, 8))
    almuerzo = AlmuerzoSerializer(required=False)  # no se puede quitar: es privacidad
    verificaciones_por_dia = serializers.IntegerField(**_rango(1, 4))
    verificacion_limite_min = serializers.IntegerField(**_rango(1, 15))
    gps_distancia_m = serializers.IntegerField(**_rango(5, 500))
    gps_intervalo_seg = serializers.IntegerField(**_rango(30, 900))
    sin_conexion_min = serializers.IntegerField(**_rango(3, 120))
    bateria_baja_pct = serializers.IntegerField(**_rango(5, 50))
    alertas_correos = serializers.CharField(allow_blank=True, max_length=2000)
    alertas_destinatarios = serializers.SerializerMethodField()
    correo_activo = serializers.SerializerMethodField()  # hay servidor SMTP en backend/.env
    retencion_meses = serializers.IntegerField(**_rango(1, 36))
    odoo_sync_min = serializers.IntegerField(**_rango(1, 10))
    espejo_odoo_min = serializers.IntegerField(**_rango(5, 60))

    class Meta:
        model = Configuracion
        fields = [
            'horario_inicio', 'horario_fin', 'cierre_auto_horas', 'almuerzo',
            'verificaciones_por_dia', 'verificacion_limite_min',
            'gps_distancia_m', 'gps_intervalo_seg',
            'sin_conexion_min', 'bateria_baja_pct', 'alertas_correos', 'alertas_destinatarios', 'correo_activo',
            'retencion_meses', 'odoo_sync_min', 'espejo_odoo_min',
        ]

    def get_alertas_destinatarios(self, config):
        return config.destinatarios_alertas()

    def get_correo_activo(self, config):
        return bool(settings.EMAIL_HOST)

    def validate_alertas_correos(self, valor):
        """Acepta correos separados por coma, punto y coma, espacios o saltos de línea; guarda "a, b"."""
        correos = []
        for c in re.split(r'[\s,;]+', valor.strip()):
            if not c:
                continue
            try:
                validate_email(c)
            except ErrorDjango:
                raise serializers.ValidationError(f'«{c}» no es un correo válido.')
            if c.lower() not in correos:
                correos.append(c.lower())
        if len(correos) > MAX_CORREOS:
            raise serializers.ValidationError(f'Como máximo {MAX_CORREOS} correos.')
        return ', '.join(correos)

    def validate(self, datos):
        config = self.instance
        inicio = datos.get('horario_inicio', config.horario_inicio if config else None)
        fin = datos.get('horario_fin', config.horario_fin if config else None)
        if inicio and fin and inicio >= fin:
            raise serializers.ValidationError({'horario_fin': 'El horario debe terminar después de empezar.'})
        almuerzo = datos.get('almuerzo')
        if almuerzo is None and ('horario_inicio' in datos or 'horario_fin' in datos):
            actual = almuerzo_configurado()
            almuerzo = actual and {'inicio': actual.hora_inicio, 'fin': actual.hora_fin}
        if almuerzo and inicio and fin and not (inicio <= almuerzo['inicio'] and almuerzo['fin'] <= fin):
            raise serializers.ValidationError({'almuerzo': 'El almuerzo debe estar dentro del horario laboral.'})
        return datos

    def to_representation(self, config):
        datos = super().to_representation(config)
        actual = almuerzo_configurado()
        datos['almuerzo'] = (AlmuerzoSerializer({'inicio': actual.hora_inicio, 'fin': actual.hora_fin}).data
                             if actual and actual.activa else None)
        return datos

    def update(self, config, datos):
        datos.pop('almuerzo', None)  # lo guarda la vista (otra tabla)
        return super().update(config, datos)
