from rest_framework import serializers

from usuarios.serializers import TecnicoResumenSerializer

MAX_PUNTOS_POR_LOTE = 1000


class PuntoSerializer(serializers.Serializer):
    """Un punto GPS enviado por la app. `velocidad` en km/h."""

    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    precision_m = serializers.FloatField(min_value=0, required=False, allow_null=True)
    velocidad = serializers.FloatField(min_value=0, required=False, allow_null=True)
    bateria = serializers.IntegerField(min_value=0, max_value=100, required=False, allow_null=True)
    registrado_en = serializers.DateTimeField()


class LoteUbicacionesSerializer(serializers.Serializer):
    """{ "puntos": [ … ] }. Cada punto se valida por separado: uno malo no tumba el lote."""

    puntos = serializers.ListField(
        child=serializers.DictField(), allow_empty=False, max_length=MAX_PUNTOS_POR_LOTE,
    )


class RespuestaUbicacionesSerializer(serializers.Serializer):
    recibidos = serializers.IntegerField()
    rechazados = serializers.IntegerField()


# Lo que NO se muestra de quien está fuera de jornada (solo se rastrea en jornada)
CAMPOS_PRIVADOS = ['ultima_lat', 'ultima_lng', 'ultima_bateria', 'ultima_velocidad', 'ultima_actualizacion']


class TecnicoMapaSerializer(TecnicoResumenSerializer):
    """TecnicoResumen + desde cuándo está en jornada. Fuera de jornada: sin ubicación."""

    jornada_inicio = serializers.DateTimeField(allow_null=True)

    class Meta(TecnicoResumenSerializer.Meta):
        fields = TecnicoResumenSerializer.Meta.fields + ['jornada_inicio']

    def to_representation(self, tecnico):
        datos = super().to_representation(tecnico)
        if not getattr(tecnico, 'en_jornada', False):
            datos['estado_actual'] = 'fuera_jornada'
            datos.update({campo: None for campo in CAMPOS_PRIVADOS})
        return datos


class MapaEnVivoSerializer(serializers.Serializer):
    actualizado_en = serializers.DateTimeField()
    tecnicos = TecnicoMapaSerializer(many=True)
