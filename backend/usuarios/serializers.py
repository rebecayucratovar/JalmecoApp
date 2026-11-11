from rest_framework import serializers

from .models import Administrador, Tecnico


# ---------- Objetos de respuesta ----------

class AdministradorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Administrador
        fields = ['id', 'nombre', 'email']


class TecnicoResumenSerializer(serializers.ModelSerializer):
    """TecnicoResumen del contrato (mapa, lista y fichas)."""

    class Meta:
        model = Tecnico
        fields = [
            'id', 'codigo', 'nombre', 'cargo', 'foto_url',
            'estado_actual', 'ultima_lat', 'ultima_lng', 'ultima_bateria', 'ultima_actualizacion',
            'celular_modelo', 'celular_numero',
        ]


class TokensSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class LoginAdminRespuestaSerializer(TokensSerializer):
    admin = AdministradorSerializer()


class LoginTecnicoRespuestaSerializer(TokensSerializer):
    tecnico = TecnicoResumenSerializer()


class RefreshRespuestaSerializer(serializers.Serializer):
    access = serializers.CharField()


# ---------- Peticiones ----------

class LoginAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class LoginTecnicoSerializer(serializers.Serializer):
    usuario = serializers.CharField(max_length=40)
    pin = serializers.RegexField(r'^\d{6}$', error_messages={'invalid': 'El PIN debe tener 6 dígitos.'})


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()
