"""Mi cuenta (administrador del panel): datos y cambio de contraseña."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErrorDjango
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from .autenticacion import emitir_tokens
from .models import Administrador
from .permisos import EsAdmin
from .serializers import AdministradorSerializer


class CuentaSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=160)

    class Meta:
        model = Administrador
        fields = ['nombre', 'email']

    def validate_nombre(self, valor):
        valor = ' '.join(valor.split())
        if not valor:
            raise serializers.ValidationError('Escribe tu nombre.')
        return valor

    def validate_email(self, valor):
        valor = valor.strip().lower()
        if Administrador.objects.filter(email__iexact=valor).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Ya hay otro administrador con este correo.')
        return valor


class CambioPasswordSerializer(serializers.Serializer):
    actual = serializers.CharField(trim_whitespace=False)
    nueva = serializers.CharField(trim_whitespace=False, max_length=128)

    def validate_actual(self, valor):
        if not self.context['admin'].check_password(valor):
            raise serializers.ValidationError('La contraseña actual no es correcta.')
        return valor

    def validate(self, datos):
        admin = self.context['admin']
        if datos['nueva'] == datos['actual']:
            raise serializers.ValidationError({'nueva': 'La nueva contraseña debe ser distinta de la actual.'})
        try:
            # Validadores de Django: largo mínimo, muy común, solo números, parecida al correo
            validate_password(datos['nueva'], user=admin)
        except ErrorDjango as e:
            raise serializers.ValidationError({'nueva': list(e.messages)})
        return datos


class CambioPasswordThrottle(UserRateThrottle):
    """Frena que alguien con una sesión abierta adivine la contraseña actual."""

    scope = 'cambio_password'


class MiCuentaView(APIView):
    """GET /mi-cuenta · PUT /mi-cuenta { nombre?, email? }"""

    permission_classes = [EsAdmin]

    def get(self, request):
        return Response(AdministradorSerializer(request.user).data)

    def put(self, request):
        datos = CuentaSerializer(request.user, data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        datos.save()
        return Response(AdministradorSerializer(request.user).data)


class MiPasswordView(APIView):
    """
    POST /mi-cuenta/password { actual, nueva } → { access, refresh }
    Las demás sesiones abiertas se cierran; esta sigue con los tokens nuevos.
    """

    permission_classes = [EsAdmin]
    throttle_classes = [CambioPasswordThrottle]

    def post(self, request):
        admin = request.user
        datos = CambioPasswordSerializer(data=request.data, context={'admin': admin})
        datos.is_valid(raise_exception=True)
        admin.set_password(datos.validated_data['nueva'])
        admin.save(update_fields=['password_hash', 'password_cambiado_en'])
        return Response(emitir_tokens(admin))
