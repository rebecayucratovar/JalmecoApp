from rest_framework import serializers

from usuarios.models import Tecnico

from .models import Alerta


class TecnicoAlertaSerializer(serializers.ModelSerializer):
    """Quién: sin ubicación (la bandeja no la necesita; el botón 📍 abre el mapa en vivo)."""

    en_jornada = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Tecnico
        fields = ['id', 'nombre', 'codigo', 'cargo', 'celular_numero', 'en_jornada']


class AlertaSerializer(serializers.ModelSerializer):
    tecnico = TecnicoAlertaSerializer()
    atendida_por = serializers.CharField(source='atendida_por.nombre', default=None)

    class Meta:
        model = Alerta
        fields = ['id', 'tecnico', 'tipo', 'mensaje', 'nivel', 'creada_en', 'estado', 'atendida_por', 'atendida_en']


class FiltroAlertasSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=Alerta.Estado.choices, required=False)
    tipo = serializers.ChoiceField(choices=Alerta.Tipo.choices, required=False)
    tecnico = serializers.IntegerField(required=False)
    desde = serializers.DateField(required=False)
    hasta = serializers.DateField(required=False)

    def validate(self, datos):
        if datos.get('desde') and datos.get('hasta') and datos['desde'] > datos['hasta']:
            raise serializers.ValidationError({'hasta': 'Debe ser igual o posterior a «desde».'})
        return datos
