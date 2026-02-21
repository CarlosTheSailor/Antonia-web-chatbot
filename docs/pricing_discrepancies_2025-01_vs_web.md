# Pricing Discrepancies: PDF 2025-01 vs Web Actual

Fuente oficial aplicada: `https://wods.es/precios/`
Fecha de corte: `2026-02-21`

| bloque | dato_pdf | dato_web | decision_final | impacto | accion |
|---|---|---|---|---|---|
| Packs mensuales | No aparece Pack 4 | Pack 4 = 35 EUR/mes | Gana web | alto | chatbot/web |
| Packs mensuales | Pack mantenimiento 30 EUR/mes (3 sesiones) | No aparece | Marcar legacy (no publicar) | alto | chatbot/pdf |
| Condiciones de cobro | Prorrateo desde dia 15 | No aparece | Marcar legacy hasta confirmacion | alto | chatbot/pdf |
| Teams cobro | Pago trimestral no fraccionable | Cuotas mensuales por team | Marcar pending_review | alto | web/pdf/chatbot |
| Colectivos edades Joves | 11-15 anos | 11-16 en precios, 12-17 en navegacion | pending_review editorial | alto | web/chatbot |
| Colectivos edades Savis | +60 | +60 en precios, +65 en navegacion | pending_review editorial | alto | web/chatbot |
| InclusiWODS condiciones | 110 EUR/mes por pareja + nota minimo inscritos | Informacion parcial en web | pending_review editorial | alto | web/chatbot/pdf |
| Running Social Club elegibilidad | Contexto solo socios en bloque teams | Pagina especifica menciona opcion no socios | pending_review editorial | medio | web/chatbot |
| Clases extra socios/no socios | Bloque explicito en PDF | Repartido entre precios/guests o no visible completo | Mantener web como oficial; documentar en catalogo | medio | web/chatbot/pdf |

## Criterios de uso en chatbot

- Publicar solo items `status=active`.
- Items `pending_review` se pueden mostrar solo con aviso de validacion interna.
- Items `legacy` no se usan para recomendacion comercial.
