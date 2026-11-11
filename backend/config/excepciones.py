"""Formato de errores del contrato: { "error": "mensaje legible", "codigo": "CODIGO" }."""
from rest_framework import exceptions
from rest_framework.views import exception_handler


def manejador_excepciones(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        response.data = {
            'error': 'Datos inválidos.',
            'codigo': 'DATOS_INVALIDOS',
            'detalle': response.data,  # errores por campo
        }
        return response

    if isinstance(exc, exceptions.Throttled):
        minutos = max(1, round((exc.wait or 60) / 60))
        response.data = {
            'error': f'Demasiados intentos. Vuelve a intentarlo en {minutos} min.',
            'codigo': 'DEMASIADOS_INTENTOS',
        }
        return response

    codigo = exc.get_codes() if isinstance(exc, exceptions.APIException) else None
    data = response.data
    mensaje = data.get('detail', data) if isinstance(data, dict) else data
    response.data = {
        'error': str(mensaje),
        'codigo': codigo.upper() if isinstance(codigo, str) else None,
    }
    return response
