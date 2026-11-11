from rest_framework import serializers

from .models import Verificacion


class VerificacionPendienteSerializer(serializers.Serializer):
    pendiente = serializers.BooleanField()
    verificacion_id = serializers.IntegerField(required=False)
    solicitada_en = serializers.DateTimeField(required=False)
    vence_en = serializers.DateTimeField(required=False)
    limite_min = serializers.IntegerField(required=False)


class ResponderVerificacionSerializer(serializers.Serializer):
    """La app solo envía `exito` (huella correcta); si no responde a tiempo queda `no_realizada`."""

    resultado = serializers.ChoiceField(choices=[Verificacion.Resultado.EXITO])
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False, allow_null=True)
    lng = serializers.FloatField(min_value=-180, max_value=180, required=False, allow_null=True)


class UltimaVerificacionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    # Solo si está pendiente y vigente: la app arma la cuenta regresiva con esto (no con su reloj)
    segundos_restantes = serializers.IntegerField(allow_null=True)
    solicitada_en = serializers.DateTimeField()
    respondida_en = serializers.DateTimeField(allow_null=True)
    resultado = serializers.CharField()
