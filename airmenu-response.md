fetch("http://localhost:3333/api/air-menu/summary?enterpriseId=1783676282102&startDate=2026-08-01&endDate=2026-08-31", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
    "authorization": "Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjgwMmI1ZDY2LWUyNDktNDY1Ny05OTUwLTEyZjI5N2YyY2ZhMiIsInR5cCI6IkpXVCJ9.eyJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3NzgwMDE2OH1dLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwiYXVkIjoiYXV0aGVudGljYXRlZCIsImVtYWlsIjoicmF1bEBhbmdyeWJveC5wdCIsImV4cCI6MTc4ODc4NTg0MSwiaWF0IjoxNzg4NzgyMjQxLCJpc19hbm9ueW1vdXMiOmZhbHNlLCJpc3MiOiJodHRwczovL2ZyYnhtZXJoZ252aG9jd3B1enJxLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJvcmdfaWQiOiJiNjk5OWNmZi03OWIyLTQ1ODMtYjhiNC1hNzQ0YjNhY2U3NDgiLCJvcmdfcm9sZSI6ImFkbWluIiwicGhvbmUiOiIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsInNlc3Npb25faWQiOiJhN2E2ZGJjOC1jY2YyLTQ2Y2UtOTA4ZC04NjhhM2NhMjUwMGEiLCJzdWIiOiI2Yzg2ZGExNS1hODZiLTRjOGItODgyMi0wYjY2YmVkMWZmNTkiLCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjp0cnVlfX0.QzYGXkdKNncyEIeNjWbF7KysOUZ9hrnWHZoMKmvVVlg46gMhd-V6jqIDeO9GywRPAEkviXZCrHjvrIsd0Pa9wg",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": "\"Not=A?Brand\";v=\"99\", \"Google Chrome\";v=\"151\", \"Chromium\";v=\"151\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "Referer": "http://localhost:5173/"
  },
  "body": null,
  "method": "GET"
});


—— RESPONSE ——

{
    "orders": [
        {
            "orderId": "4637411",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-31T21:16:33.377Z",
            "documentDate": "2026-08-31T21:16:45.138Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788211002841,
                    "orderId": "4637411",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1788211005138,
                    "orderId": "4637411",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788211960636,
                    "orderId": "4637411",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788212236896,
                    "orderId": "4637411",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788212237373,
                    "orderId": "4637411",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "1A943",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "1A943",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788211486000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "31/08/2026 22:24",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4637409",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-31T21:16:25.956Z",
            "documentDate": "2026-08-31T21:16:30.222Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Brigadeiro S",
                    "plu": "ITM-1581974950",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Maria Eduarda",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788210990222,
                    "orderId": "4637409",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788210996159,
                    "orderId": "4637409",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788211961151,
                    "orderId": "4637409",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788212235621,
                    "orderId": "4637409",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788212236146,
                    "orderId": "4637409",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "783CF",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "783CF",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788211582000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "31/08/2026 22:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4637349",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-31T20:43:24.941Z",
            "documentDate": "2026-08-31T20:43:29.052Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Orkhan",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788209009052,
                    "orderId": "4637349",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788209013945,
                    "orderId": "4637349",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788210222027,
                    "orderId": "4637349",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788210242469,
                    "orderId": "4637349",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788210243032,
                    "orderId": "4637349",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101759627714-474",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101759627714-474",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788209721000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "31/08/2026 21:55",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4637324",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-31T20:32:04.417Z",
            "documentDate": "2026-08-31T20:32:08.603Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Meryem",
            "lastName": "T.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788208328603,
                    "orderId": "4637324",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788208333674,
                    "orderId": "4637324",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788208808668,
                    "orderId": "4637324",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788210240763,
                    "orderId": "4637324",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788210241353,
                    "orderId": "4637324",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101759618454-588",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101759618454-588",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788208980000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "31/08/2026 21:43",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4636988",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-31T19:07:07.043Z",
            "documentDate": "2026-08-31T19:07:11.674Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese L",
                    "plu": "ITM-1168202192",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 55.7,
            "firstName": "Paul",
            "lastName": "N.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788203231674,
                    "orderId": "4636988",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788203236302,
                    "orderId": "4636988",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788204212822,
                    "orderId": "4636988",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788204656101,
                    "orderId": "4636988",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788204656528,
                    "orderId": "4636988",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "5BD33",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "5BD33",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788204112000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "31/08/2026 20:21",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4636261",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-31T12:51:59.603Z",
            "documentDate": "2026-08-31T12:52:04.283Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 28.4,
            "firstName": "Yosri",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788180724283,
                    "orderId": "4636261",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788180729466,
                    "orderId": "4636261",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788180947977,
                    "orderId": "4636261",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788180949391,
                    "orderId": "4636261",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788181304121,
                    "orderId": "4636261",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788181307209,
                    "orderId": "4636261",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101759085852-296",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101759085852-296",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788181368000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "31/08/2026 14:02",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4635463",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-30T21:14:49.761Z",
            "documentDate": "2026-08-30T21:18:28.404Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788124501118,
                    "orderId": "4635463",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1788124708404,
                    "orderId": "4635463",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788124734049,
                    "orderId": "4635463",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788126070632,
                    "orderId": "4635463",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788126071155,
                    "orderId": "4635463",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "C60AF",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "C60AF",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788125010000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "30/08/2026 22:23",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4634888",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-30T18:55:20.635Z",
            "documentDate": "2026-08-30T18:55:25.612Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 3
                }
            ],
            "total": 63.199999999999996,
            "firstName": "Maria Luiza",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788116125612,
                    "orderId": "4634888",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788116134102,
                    "orderId": "4634888",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788116885842,
                    "orderId": "4634888",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788126068674,
                    "orderId": "4634888",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788126069933,
                    "orderId": "4634888",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "E3BEE",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "312283512",
                "AM_PROVIDER_ORDER_ID": "E3BEE",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788117099000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "30/08/2026 20:11",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4634039",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-30T15:54:22.822Z",
            "documentDate": "2026-08-30T15:54:27.299Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 25.8,
            "firstName": "Lu�s",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788105267299,
                    "orderId": "4634039",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788105272229,
                    "orderId": "4634039",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788107120497,
                    "orderId": "4634039",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788107121288,
                    "orderId": "4634039",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788107123064,
                    "orderId": "4634039",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101758224395-999",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101758224395-999",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788106100000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "30/08/2026 17:08",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4633471",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-30T13:50:33.549Z",
            "documentDate": "2026-08-30T13:50:37.649Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Joe",
            "lastName": "W.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788097837649,
                    "orderId": "4633471",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788097843460,
                    "orderId": "4633471",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788098412626,
                    "orderId": "4633471",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788107123914,
                    "orderId": "4633471",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788107124464,
                    "orderId": "4633471",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "AB32C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "AB32C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788098035000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "30/08/2026 14:53",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4633404",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-30T13:30:09.037Z",
            "documentDate": "2026-08-30T13:30:13.493Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 44.3,
            "firstName": "Miguel",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788096613493,
                    "orderId": "4633404",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788096618344,
                    "orderId": "4633404",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788097422927,
                    "orderId": "4633404",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788097542340,
                    "orderId": "4633404",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788097543415,
                    "orderId": "4633404",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "337DD",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "337DD",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788097345000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "30/08/2026 14:42",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4632921",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-30T11:00:36.544Z",
            "documentDate": "2026-08-30T11:00:41.557Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 30.9,
            "firstName": "Yosri",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788087641557,
                    "orderId": "4632921",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788087646519,
                    "orderId": "4632921",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788088396180,
                    "orderId": "4632921",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788088777708,
                    "orderId": "4632921",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788088779374,
                    "orderId": "4632921",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101757844078-360",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101757844078-360",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788087830000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "30/08/2026 12:03",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4631648",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-29T19:53:39.437Z",
            "documentDate": "2026-08-29T19:53:43.768Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Gon�alo",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788033223768,
                    "orderId": "4631648",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788033228739,
                    "orderId": "4631648",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788034722705,
                    "orderId": "4631648",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788034831426,
                    "orderId": "4631648",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788034832042,
                    "orderId": "4631648",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "6C4E6",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "6C4E6",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788034540000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "29/08/2026 21:15",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4631201",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-29T18:04:27.413Z",
            "documentDate": "2026-08-29T18:04:32.998Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Liliana",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788026672998,
                    "orderId": "4631201",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788026678062,
                    "orderId": "4631201",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788027366826,
                    "orderId": "4631201",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788028793098,
                    "orderId": "4631201",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788028793810,
                    "orderId": "4631201",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "C0984",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "C0984",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788027403000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "29/08/2026 19:16",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4631018",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-29T17:13:23.141Z",
            "documentDate": "2026-08-29T17:13:28.852Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Chelsea Ande",
            "lastName": "E.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788023608852,
                    "orderId": "4631018",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788023613689,
                    "orderId": "4631018",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788024298527,
                    "orderId": "4631018",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788027610128,
                    "orderId": "4631018",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788027614526,
                    "orderId": "4631018",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "A7761",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "A7761",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788024194000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "29/08/2026 18:23",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4630248",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-29T13:24:02.547Z",
            "documentDate": "2026-08-29T13:24:09.950Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 32.3,
            "firstName": "Josefina",
            "lastName": "T.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1788009849950,
                    "orderId": "4630248",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1788009857140,
                    "orderId": "4630248",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788010597026,
                    "orderId": "4630248",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788011526298,
                    "orderId": "4630248",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1788011526889,
                    "orderId": "4630248",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "B59C3",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "B59C3",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1788010909000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "29/08/2026 14:41",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4628860",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-28T21:04:25.367Z",
            "documentDate": "2026-08-28T21:04:29.941Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Emily",
            "lastName": "T.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787951069941,
                    "orderId": "4628860",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787951074972,
                    "orderId": "4628860",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787951788815,
                    "orderId": "4628860",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787952372373,
                    "orderId": "4628860",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787952372928,
                    "orderId": "4628860",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101756553191-366",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101756553191-366",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787951842000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 22:17",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4628739",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-28T20:34:54.738Z",
            "documentDate": "2026-08-28T20:34:58.898Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Pedro",
            "lastName": "V.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787949298898,
                    "orderId": "4628739",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787949306790,
                    "orderId": "4628739",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787949761371,
                    "orderId": "4628739",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787951844103,
                    "orderId": "4628739",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787951844700,
                    "orderId": "4628739",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "944BA",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "944BA",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787949645000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 21:40",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4628722",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-28T20:29:08.612Z",
            "documentDate": "2026-08-28T20:29:14.310Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Chelsea Ande",
            "lastName": "E.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787948954310,
                    "orderId": "4628722",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787948958918,
                    "orderId": "4628722",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787949759295,
                    "orderId": "4628722",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787949890956,
                    "orderId": "4628722",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787949891503,
                    "orderId": "4628722",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "96772",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "96772",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787949562000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 21:39",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4628598",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-28T19:45:15.775Z",
            "documentDate": "2026-08-28T19:45:19.819Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Aidan",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787946319819,
                    "orderId": "4628598",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787946324856,
                    "orderId": "4628598",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787946329349,
                    "orderId": "4628598",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787947030097,
                    "orderId": "4628598",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787947550786,
                    "orderId": "4628598",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787947551262,
                    "orderId": "4628598",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "271C9",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "271C9",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787946885000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 20:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4628085",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-28T17:30:38.340Z",
            "documentDate": "2026-08-28T17:30:44.852Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Maria",
            "lastName": "E.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787938244852,
                    "orderId": "4628085",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787938249769,
                    "orderId": "4628085",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787938969342,
                    "orderId": "4628085",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787939020314,
                    "orderId": "4628085",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787939020790,
                    "orderId": "4628085",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "DBAD8",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "DBAD8",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787938804000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 18:40",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4628034",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-28T17:13:42.735Z",
            "documentDate": "2026-08-28T17:13:48.115Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Anojah",
            "lastName": "J.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787937228115,
                    "orderId": "4628034",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787937234622,
                    "orderId": "4628034",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787937879151,
                    "orderId": "4628034",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787939021381,
                    "orderId": "4628034",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787939022227,
                    "orderId": "4628034",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101756220882-582",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101756220882-582",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787938059000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 18:27",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4627331",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-28T11:29:01.293Z",
            "documentDate": "2026-08-28T11:29:05.530Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "+ Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 16.4,
            "firstName": "Nana",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787916545530,
                    "orderId": "4627331",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787916550791,
                    "orderId": "4627331",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787917131862,
                    "orderId": "4627331",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787917291239,
                    "orderId": "4627331",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787917911427,
                    "orderId": "4627331",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787917912292,
                    "orderId": "4627331",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101755834431-750",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101755834431-750",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787917198000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 12:39",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": "Cutlery: true"
            }
        },
        {
            "orderId": "4627303",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-28T11:16:20.337Z",
            "documentDate": "2026-08-28T11:16:24.785Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Ana",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787915784785,
                    "orderId": "4627303",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787915789717,
                    "orderId": "4627303",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787916387353,
                    "orderId": "4627303",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787916434401,
                    "orderId": "4627303",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787916435648,
                    "orderId": "4627303",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101755819333-446",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101755819333-446",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787916436000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "28/08/2026 12:27",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": "Cutlery: true"
            }
        },
        {
            "orderId": "4625698",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-27T18:42:09.990Z",
            "documentDate": "2026-08-27T18:42:14.280Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-469585237",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "Helena",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787856134280,
                    "orderId": "4625698",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787856139916,
                    "orderId": "4625698",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787856950391,
                    "orderId": "4625698",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787857717443,
                    "orderId": "4625698",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787857742152,
                    "orderId": "4625698",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101755390607-580",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101755390607-580",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787856786000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "27/08/2026 19:53",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4625382",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-27T16:47:18.141Z",
            "documentDate": "2026-08-27T16:47:23.724Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Tuna e Mayo S",
                    "plu": "ITM-902166555",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 61.6,
            "firstName": "Ana",
            "lastName": "F.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787849243724,
                    "orderId": "4625382",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787849248732,
                    "orderId": "4625382",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787850416745,
                    "orderId": "4625382",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787850533827,
                    "orderId": "4625382",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787850534595,
                    "orderId": "4625382",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "851B3",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "851B3",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787849782000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "27/08/2026 17:56",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4625065",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-27T13:22:18.232Z",
            "documentDate": "2026-08-27T13:22:22.623Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Maria In�s",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787836942623,
                    "orderId": "4625065",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787836947657,
                    "orderId": "4625065",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787837284867,
                    "orderId": "4625065",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787837289634,
                    "orderId": "4625065",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787837290773,
                    "orderId": "4625065",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "60C65",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "167004026",
                "AM_PROVIDER_ORDER_ID": "60C65",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787837437000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "27/08/2026 14:30",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4625008",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-27T12:48:36.064Z",
            "documentDate": "2026-08-27T12:48:40.440Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 41.8,
            "firstName": "Ronaldo",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787834920440,
                    "orderId": "4625008",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787834925114,
                    "orderId": "4625008",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787835949500,
                    "orderId": "4625008",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787837671004,
                    "orderId": "4625008",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787837671579,
                    "orderId": "4625008",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101754993243-006",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101754993243-006",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787835753000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "27/08/2026 14:02",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4623878",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-26T21:07:22.473Z",
            "documentDate": "2026-08-26T21:07:28.287Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787778448287,
                    "orderId": "4623878",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787778453200,
                    "orderId": "4623878",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787779887326,
                    "orderId": "4623878",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787780850289,
                    "orderId": "4623878",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787780850835,
                    "orderId": "4623878",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "2317A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "2317A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787779003000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "26/08/2026 22:16",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4622797",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-26T12:29:33.235Z",
            "documentDate": "2026-08-26T12:29:42.296Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Hugo",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787747382296,
                    "orderId": "4622797",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787747387351,
                    "orderId": "4622797",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787747715080,
                    "orderId": "4622797",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787780848829,
                    "orderId": "4622797",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787780849420,
                    "orderId": "4622797",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "5D03F",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "5D03F",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787747878000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "26/08/2026 13:37",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4622695",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-26T11:47:48.017Z",
            "documentDate": "2026-08-26T11:47:56.715Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Teresa",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787744876715,
                    "orderId": "4622695",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787744880967,
                    "orderId": "4622695",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787745421220,
                    "orderId": "4622695",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787745955816,
                    "orderId": "4622695",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787745956530,
                    "orderId": "4622695",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "E22FB",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "E22FB",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787745464000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "26/08/2026 12:57",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4622653",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-26T11:29:48.117Z",
            "documentDate": "2026-08-26T11:29:55.837Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Arad",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787743795837,
                    "orderId": "4622653",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787743801943,
                    "orderId": "4622653",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787744329799,
                    "orderId": "4622653",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787745943145,
                    "orderId": "4622653",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787745944346,
                    "orderId": "4622653",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101754010790-736",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101754010790-736",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787744683000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "26/08/2026 12:44",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4621594",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-25T21:20:47.856Z",
            "documentDate": "2026-08-25T21:20:52.241Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Brigadeiro S",
                    "plu": "ITM-1581974950",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Carolina",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787692852241,
                    "orderId": "4621594",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787692856711,
                    "orderId": "4621594",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787693414478,
                    "orderId": "4621594",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787694185827,
                    "orderId": "4621594",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787694186458,
                    "orderId": "4621594",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F19EC",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F19EC",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787693354000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "25/08/2026 22:29",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": "ol�! seria poss�vel colocar um bocadinho menos de mel na pizza de pepperoni? eu amo o agridoce mas a �ltima vez que pedi achei um bocadinho intenso. muito obrigada desde j� e bom trabalho :)"
            }
        },
        {
            "orderId": "4621578",
            "platform": "Bolt Food",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Bolt",
            "orderDate": "2026-08-25T21:13:23.727Z",
            "documentDate": "2026-08-25T21:13:28.745Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "�gua mineral 51cl",
                    "plu": "",
                    "price": 2,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Laura",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787692408745,
                    "orderId": "4621578",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787692413716,
                    "orderId": "4621578",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "info@airmenu.com",
                    "datetime": 1787692496012,
                    "orderId": "4621578",
                    "key": "PICKING_UP",
                    "operator": "Rui Oliveira"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787693074992,
                    "orderId": "4621578",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787694181861,
                    "orderId": "4621578",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787694182685,
                    "orderId": "4621578",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "33BXE",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "33BXE",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787693166000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "25/08/2026 22:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "BoltFood",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4621258",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-25T19:10:00.644Z",
            "documentDate": "2026-08-25T19:10:05.692Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tuna e Mayo S",
                    "plu": "ITM-902166555",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Andrew",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787685005692,
                    "orderId": "4621258",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787685010558,
                    "orderId": "4621258",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787685836814,
                    "orderId": "4621258",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787686741893,
                    "orderId": "4621258",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787686743065,
                    "orderId": "4621258",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "9E1FA",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "9E1FA",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787685807000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "25/08/2026 20:23",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4621146",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-25T18:31:02.650Z",
            "documentDate": "2026-08-25T18:31:08.170Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 34.3,
            "firstName": "Edvandro",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787682668170,
                    "orderId": "4621146",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787682672883,
                    "orderId": "4621146",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787683485854,
                    "orderId": "4621146",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787683620044,
                    "orderId": "4621146",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787683620517,
                    "orderId": "4621146",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787683621437,
                    "orderId": "4621146",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "103D1",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "302450050",
                "AM_PROVIDER_ORDER_ID": "103D1",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787683623000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "25/08/2026 19:47",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4620977",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-25T16:55:48.679Z",
            "documentDate": "2026-08-25T16:55:53.851Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 2
                },
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 34.8,
            "firstName": "Edward",
            "lastName": "W.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787676953851,
                    "orderId": "4620977",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787676958759,
                    "orderId": "4620977",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787677630903,
                    "orderId": "4620977",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787679908958,
                    "orderId": "4620977",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787679913096,
                    "orderId": "4620977",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787679914982,
                    "orderId": "4620977",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "1B42F",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "1B42F",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787677272000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "25/08/2026 18:01",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4620674",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-25T14:04:45.148Z",
            "documentDate": "2026-08-25T14:04:49.798Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Maria In�s",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787666689798,
                    "orderId": "4620674",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787666694936,
                    "orderId": "4620674",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787666886269,
                    "orderId": "4620674",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787667863283,
                    "orderId": "4620674",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787667864672,
                    "orderId": "4620674",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "55F5E",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "167004026",
                "AM_PROVIDER_ORDER_ID": "55F5E",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787667251000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "25/08/2026 15:14",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4619272",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-24T21:18:18.297Z",
            "documentDate": "2026-08-24T21:18:24.071Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Basel",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787606304071,
                    "orderId": "4619272",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787606308434,
                    "orderId": "4619272",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787606719766,
                    "orderId": "4619272",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787607682070,
                    "orderId": "4619272",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787666884765,
                    "orderId": "4619272",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "B48C5",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "B48C5",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787606898000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "24/08/2026 22:28",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4618720",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-24T18:34:44.991Z",
            "documentDate": "2026-08-24T18:34:50.166Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 16.4,
            "firstName": "Gre",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787596490166,
                    "orderId": "4618720",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787596495016,
                    "orderId": "4618720",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787597181081,
                    "orderId": "4618720",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787598664926,
                    "orderId": "4618720",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787598666608,
                    "orderId": "4618720",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101752712492-342",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101752712492-342",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787597141000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "24/08/2026 19:45",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4618558",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-24T17:40:50.686Z",
            "documentDate": "2026-08-24T17:40:56.099Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Seven Up 33cl",
                    "plu": "ITM-1659767771",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Doce de Leite & Banana S",
                    "plu": "ITM-1204180063",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 44.199999999999996,
            "firstName": "Haley",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787593256099,
                    "orderId": "4618558",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787593260885,
                    "orderId": "4618558",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787594531669,
                    "orderId": "4618558",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787595432968,
                    "orderId": "4618558",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787595435009,
                    "orderId": "4618558",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "8F655",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "8F655",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787594488000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "24/08/2026 19:01",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4617220",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-23T20:58:59.346Z",
            "documentDate": "2026-08-23T20:59:03.748Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Mateus",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787518743748,
                    "orderId": "4617220",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787518747983,
                    "orderId": "4617220",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787521404362,
                    "orderId": "4617220",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787521442244,
                    "orderId": "4617220",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787521454974,
                    "orderId": "4617220",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F652E",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F652E",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787519448000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 22:10",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4617097",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-23T20:18:18.657Z",
            "documentDate": "2026-08-23T20:18:23.957Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "�gua mineral 51cl",
                    "plu": "",
                    "price": 2,
                    "count": 2
                }
            ],
            "total": 17.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787516303957,
                    "orderId": "4617097",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787516308956,
                    "orderId": "4617097",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787517359854,
                    "orderId": "4617097",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787521455894,
                    "orderId": "4617097",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787521456305,
                    "orderId": "4617097",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F3D77",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F3D77",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787516905000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 21:28",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4617034",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-23T19:55:55.465Z",
            "documentDate": "2026-08-23T19:55:59.684Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Dylan",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787514959684,
                    "orderId": "4617034",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787514964693,
                    "orderId": "4617034",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515673779,
                    "orderId": "4617034",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515849500,
                    "orderId": "4617034",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515850029,
                    "orderId": "4617034",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "E6E6A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "E6E6A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787515522000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 21:05",
                "AM_ORDER_TYPE": "PICK_UP",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4617021",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-23T19:52:46.014Z",
            "documentDate": "2026-08-23T19:52:50.093Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Liliana",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787514770093,
                    "orderId": "4617021",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787514775026,
                    "orderId": "4617021",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787514774276,
                    "orderId": "4617021",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515686214,
                    "orderId": "4617021",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515848011,
                    "orderId": "4617021",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515848580,
                    "orderId": "4617021",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F7F32",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F7F32",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787515359000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 21:02",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4616828",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-23T18:55:04.210Z",
            "documentDate": "2026-08-23T18:55:08.275Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Pedro",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787511308275,
                    "orderId": "4616828",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787511313326,
                    "orderId": "4616828",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512590449,
                    "orderId": "4616828",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512689015,
                    "orderId": "4616828",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512689566,
                    "orderId": "4616828",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101751809880-818",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "518995666",
                "AM_PROVIDER_ORDER_ID": "101751809880-818",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787511754000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 20:02",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4616727",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-23T18:19:35.687Z",
            "documentDate": "2026-08-23T18:19:41.459Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Audrey",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787509194388,
                    "orderId": "4616727",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1787509181459,
                    "orderId": "4616727",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787510185511,
                    "orderId": "4616727",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512690400,
                    "orderId": "4616727",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512690962,
                    "orderId": "4616727",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101751744179-215",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101751744179-215",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787509892000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 19:31",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4616682",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-23T18:07:53.537Z",
            "documentDate": "2026-08-23T18:07:58.806Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Lori",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787508478806,
                    "orderId": "4616682",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787508483755,
                    "orderId": "4616682",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787509512341,
                    "orderId": "4616682",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512691969,
                    "orderId": "4616682",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512692499,
                    "orderId": "4616682",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101751723188-439",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101751723188-439",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787509310000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 19:21",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4616606",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-23T17:42:28.868Z",
            "documentDate": "2026-08-23T17:42:33.643Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "+ Focaccia de Doce de Leite e Banana XS",
                    "plu": "",
                    "price": 8.9,
                    "count": 1
                }
            ],
            "total": 22.8,
            "firstName": "Yuriy",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787506953643,
                    "orderId": "4616606",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787506958619,
                    "orderId": "4616606",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787507900861,
                    "orderId": "4616606",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787512693199,
                    "orderId": "4616606",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787515845127,
                    "orderId": "4616606",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101751680838-748",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101751680838-748",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787507664000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 18:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4616369",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-23T15:36:52.845Z",
            "documentDate": "2026-08-23T15:36:57.536Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Joel",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787499417536,
                    "orderId": "4616369",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787499422438,
                    "orderId": "4616369",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787499957644,
                    "orderId": "4616369",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787500717703,
                    "orderId": "4616369",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787500718180,
                    "orderId": "4616369",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101751521560-560",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101751521560-560",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787500129000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 16:48",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4616118",
            "platform": "Bolt Food",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Bolt",
            "orderDate": "2026-08-23T12:46:35.577Z",
            "documentDate": "2026-08-23T12:46:39.990Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Daniel",
            "lastName": "G.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787489199990,
                    "orderId": "4616118",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787489204966,
                    "orderId": "4616118",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "info@airmenu.com",
                    "datetime": 1787490025826,
                    "orderId": "4616118",
                    "key": "PICKING_UP",
                    "operator": "Rui Oliveira"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787490069423,
                    "orderId": "4616118",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787493279717,
                    "orderId": "4616118",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787493281076,
                    "orderId": "4616118",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "7VN65",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "7VN65",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787490371000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 14:06",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "BoltFood",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4615973",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-23T11:31:22.668Z",
            "documentDate": "2026-08-23T11:31:27.716Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tuna e Mayo L",
                    "plu": "ITM-902166555",
                    "price": 23.5,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "Artem",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787484687716,
                    "orderId": "4615973",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787484692447,
                    "orderId": "4615973",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787485534527,
                    "orderId": "4615973",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787487953016,
                    "orderId": "4615973",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787487953932,
                    "orderId": "4615973",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101751224507-020",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101751224507-020",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787485338000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "23/08/2026 12:42",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4614971",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-22T21:28:45.231Z",
            "documentDate": "2026-08-22T21:28:49.517Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Daniel",
            "lastName": "Z.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787434129517,
                    "orderId": "4614971",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787434135719,
                    "orderId": "4614971",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787434924666,
                    "orderId": "4614971",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787435015386,
                    "orderId": "4614971",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787482990794,
                    "orderId": "4614971",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F6444",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F6444",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787434790000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 22:39",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4614921",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-22T21:08:55.053Z",
            "documentDate": "2026-08-22T21:08:59.520Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787432939520,
                    "orderId": "4614921",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787432944513,
                    "orderId": "4614921",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787433517070,
                    "orderId": "4614921",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787435010745,
                    "orderId": "4614921",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787435011476,
                    "orderId": "4614921",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "24C77",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "24C77",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787433695000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 22:21",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4614722",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-22T20:11:29.910Z",
            "documentDate": "2026-08-22T20:11:34.728Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 2
                }
            ],
            "total": 51.8,
            "firstName": "Maria",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787429494728,
                    "orderId": "4614722",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787429501089,
                    "orderId": "4614722",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787432056449,
                    "orderId": "4614722",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787432062547,
                    "orderId": "4614722",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787432063084,
                    "orderId": "4614722",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "4E975",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "4E975",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787429845000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 21:17",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4614511",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-22T19:13:51.629Z",
            "documentDate": "2026-08-22T19:13:57.342Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "1906 Reserva Especial",
                    "plu": "",
                    "price": 4,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 17.9,
            "firstName": "Jose",
            "lastName": "Rodrigues",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787426037342,
                    "orderId": "4614511",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787426043595,
                    "orderId": "4614511",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787426881957,
                    "orderId": "4614511",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787429046621,
                    "orderId": "4614511",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787429046974,
                    "orderId": "4614511",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101750808052-019",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101750808052-019",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787426747000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 20:25",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4614409",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-22T18:49:54.963Z",
            "documentDate": "2026-08-22T18:49:59.844Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Pietra",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787424599844,
                    "orderId": "4614409",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787424605713,
                    "orderId": "4614409",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787425366831,
                    "orderId": "4614409",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787426032610,
                    "orderId": "4614409",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787426039621,
                    "orderId": "4614409",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "9F919",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "9F919",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787424910000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 19:55",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4613988",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-22T17:10:27.715Z",
            "documentDate": "2026-08-22T17:10:32.176Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Doce de Leite & Banana S",
                    "plu": "ITM-1204180063",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 25.8,
            "firstName": "Maria",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787418632176,
                    "orderId": "4613988",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787418637710,
                    "orderId": "4613988",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787419385165,
                    "orderId": "4613988",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787421198816,
                    "orderId": "4613988",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787421199628,
                    "orderId": "4613988",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101750623927-986",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101750623927-986",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787419524000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 18:25",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4613925",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-22T16:54:46.561Z",
            "documentDate": "2026-08-22T16:54:51.339Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Sara",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787417691339,
                    "orderId": "4613925",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787417696246,
                    "orderId": "4613925",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787418541835,
                    "orderId": "4613925",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787418628988,
                    "orderId": "4613925",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787418633593,
                    "orderId": "4613925",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101750604556-328",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101750604556-328",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787418582000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 18:09",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4613065",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-22T13:39:56.801Z",
            "documentDate": "2026-08-22T13:40:01.231Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto L",
                    "plu": "ITM-880163054",
                    "price": 23.5,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "Jos�",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787406001231,
                    "orderId": "4613065",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787406006097,
                    "orderId": "4613065",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413589777,
                    "orderId": "4613065",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413593353,
                    "orderId": "4613065",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413594294,
                    "orderId": "4613065",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "70AD1",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "219923337",
                "AM_PROVIDER_ORDER_ID": "70AD1",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787406851000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 14:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4612599",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-22T11:57:18.757Z",
            "documentDate": "2026-08-22T11:57:23.845Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Paula",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787399843845,
                    "orderId": "4612599",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787399848856,
                    "orderId": "4612599",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787403392005,
                    "orderId": "4612599",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413596356,
                    "orderId": "4612599",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413596916,
                    "orderId": "4612599",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "6A5FB",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "6A5FB",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787400474000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "22/08/2026 13:07",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4611038",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-21T21:00:44.110Z",
            "documentDate": "2026-08-21T21:00:48.634Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787346048634,
                    "orderId": "4611038",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787346053993,
                    "orderId": "4611038",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787346478875,
                    "orderId": "4611038",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413595080,
                    "orderId": "4611038",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787413595614,
                    "orderId": "4611038",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "AD9F7",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "AD9F7",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787346503000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "21/08/2026 22:08",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4610531",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-21T18:59:11.445Z",
            "documentDate": "2026-08-21T18:59:16.232Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Brigadeiro S",
                    "plu": "ITM-1581974950",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 30.299999999999997,
            "firstName": "Michele",
            "lastName": "..",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787338756232,
                    "orderId": "4610531",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787338761107,
                    "orderId": "4610531",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787339695795,
                    "orderId": "4610531",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787340118804,
                    "orderId": "4610531",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787340119485,
                    "orderId": "4610531",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "78731",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "78731",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787339575000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "21/08/2026 20:12",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4610119",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-21T17:20:03.929Z",
            "documentDate": "2026-08-21T17:20:09.062Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Dmytro",
            "lastName": "K.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787332809062,
                    "orderId": "4610119",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787332814788,
                    "orderId": "4610119",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787333531501,
                    "orderId": "4610119",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787334613961,
                    "orderId": "4610119",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787334614510,
                    "orderId": "4610119",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "047BB",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "329575848",
                "AM_PROVIDER_ORDER_ID": "047BB",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787333642000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "21/08/2026 18:34",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4607116",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-20T20:40:34.792Z",
            "documentDate": "2026-08-20T20:40:39.155Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787258439155,
                    "orderId": "4607116",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787258444038,
                    "orderId": "4607116",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787259144381,
                    "orderId": "4607116",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787262229231,
                    "orderId": "4607116",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787262236269,
                    "orderId": "4607116",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787262237360,
                    "orderId": "4607116",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "922DE",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "922DE",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787258844000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "20/08/2026 21:47",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4606880",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-20T19:26:22.278Z",
            "documentDate": "2026-08-20T19:26:27.355Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 25.8,
            "firstName": "Diogo",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787253987355,
                    "orderId": "4606880",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787253995108,
                    "orderId": "4606880",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787254586650,
                    "orderId": "4606880",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787256913126,
                    "orderId": "4606880",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787256913796,
                    "orderId": "4606880",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "80112",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "260479926",
                "AM_PROVIDER_ORDER_ID": "80112",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787254225000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "20/08/2026 20:30",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4606345",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-20T17:15:13.290Z",
            "documentDate": "2026-08-20T17:15:18.946Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 2
                }
            ],
            "total": 21.4,
            "firstName": "Janelle",
            "lastName": "K.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787246118946,
                    "orderId": "4606345",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787246124117,
                    "orderId": "4606345",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787246810048,
                    "orderId": "4606345",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787248190537,
                    "orderId": "4606345",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787248191010,
                    "orderId": "4606345",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F6BFF",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F6BFF",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787246766000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "20/08/2026 18:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4606109",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-20T16:14:00.657Z",
            "documentDate": "2026-08-20T16:14:06.249Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Steyce",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787242446249,
                    "orderId": "4606109",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787242450063,
                    "orderId": "4606109",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787243233894,
                    "orderId": "4606109",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787245158127,
                    "orderId": "4606109",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787245159442,
                    "orderId": "4606109",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "DBF6E",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "DBF6E",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787243040000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "20/08/2026 17:24",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4603697",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-19T20:41:42.502Z",
            "documentDate": "2026-08-19T20:41:47.239Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Carlos",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787172107239,
                    "orderId": "4603697",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787172112193,
                    "orderId": "4603697",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787172731253,
                    "orderId": "4603697",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787172995923,
                    "orderId": "4603697",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787172996463,
                    "orderId": "4603697",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101748122218-664",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101748122218-664",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787172866000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "19/08/2026 21:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4602639",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-19T16:28:45.481Z",
            "documentDate": "2026-08-19T16:43:58.387Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Tuna e Mayo S",
                    "plu": "ITM-902166555",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 61.6,
            "firstName": "Ana",
            "lastName": "F.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787156936290,
                    "orderId": "4602639",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1787157838387,
                    "orderId": "4602639",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787158842313,
                    "orderId": "4602639",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787158846779,
                    "orderId": "4602639",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787158847290,
                    "orderId": "4602639",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "ABB00",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "ABB00",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787157281000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "19/08/2026 17:34",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4601613",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-19T12:24:36.492Z",
            "documentDate": "2026-08-19T16:43:40.127Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 39.8,
            "firstName": "Natalia",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787142286675,
                    "orderId": "4601613",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1787157820127,
                    "orderId": "4601613",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787158406525,
                    "orderId": "4601613",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787158843222,
                    "orderId": "4601613",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787158846012,
                    "orderId": "4601613",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101747592486-520",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101747592486-520",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787143111000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "19/08/2026 13:38",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4599826",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-18T20:11:55.065Z",
            "documentDate": "2026-08-18T20:11:59.182Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 34.3,
            "firstName": "Edvandro",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787083919182,
                    "orderId": "4599826",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787083924391,
                    "orderId": "4599826",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787084682279,
                    "orderId": "4599826",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085440348,
                    "orderId": "4599826",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085440807,
                    "orderId": "4599826",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "582CB",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "302450050",
                "AM_PROVIDER_ORDER_ID": "582CB",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787084566000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "18/08/2026 21:22",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4599806",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-18T20:04:12.959Z",
            "documentDate": "2026-08-18T20:04:17.114Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Doce de Leite & Banana S",
                    "plu": "ITM-1204180063",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Seven Up 33cl",
                    "plu": "ITM-1659767771",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 28.3,
            "firstName": "Pedro",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787083457114,
                    "orderId": "4599806",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787083462558,
                    "orderId": "4599806",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787084212984,
                    "orderId": "4599806",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085441327,
                    "orderId": "4599806",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085441847,
                    "orderId": "4599806",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "3075D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "3075D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787084309000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "18/08/2026 21:18",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4599750",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-18T19:48:09.281Z",
            "documentDate": "2026-08-18T19:48:13.496Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-469585237",
                    "price": 23.5,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "James",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787082493496,
                    "orderId": "4599750",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787082498354,
                    "orderId": "4599750",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787082916451,
                    "orderId": "4599750",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787083275701,
                    "orderId": "4599750",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085439281,
                    "orderId": "4599750",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085439830,
                    "orderId": "4599750",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "223BE",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "223BE",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787083002000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "18/08/2026 20:56",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4599725",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-18T19:41:36.705Z",
            "documentDate": "2026-08-18T19:43:17.360Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "+ Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 34.8,
            "firstName": "Ani",
            "lastName": "G.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787082105640,
                    "orderId": "4599725",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1787082197360,
                    "orderId": "4599725",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787082783464,
                    "orderId": "4599725",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085437476,
                    "orderId": "4599725",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787085438221,
                    "orderId": "4599725",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101747191111-600",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101747191111-600",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787082932000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "18/08/2026 20:55",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4599279",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-18T17:42:28.816Z",
            "documentDate": "2026-08-18T17:42:32.975Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 2
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 44.8,
            "firstName": "Jeremy",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787074952975,
                    "orderId": "4599279",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787074957872,
                    "orderId": "4599279",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787075837362,
                    "orderId": "4599279",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787076255187,
                    "orderId": "4599279",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787076257710,
                    "orderId": "4599279",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "892CC",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "892CC",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787075349000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "18/08/2026 18:49",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4596282",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-17T21:06:52.248Z",
            "documentDate": "2026-08-17T21:06:56.597Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1787000816597,
                    "orderId": "4596282",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1787000821825,
                    "orderId": "4596282",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787075393014,
                    "orderId": "4596282",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787076255802,
                    "orderId": "4596282",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1787076256720,
                    "orderId": "4596282",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "2C118",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "2C118",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1787001676000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "17/08/2026 22:21",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4595622",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-17T18:11:22.223Z",
            "documentDate": "2026-08-17T18:11:27.147Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "meneguiti7",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786990287147,
                    "orderId": "4595622",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786990291919,
                    "orderId": "4595622",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786991010552,
                    "orderId": "4595622",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786991408786,
                    "orderId": "4595622",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786991409207,
                    "orderId": "4595622",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101746208005-850",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101746208005-850",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786991057000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "17/08/2026 19:24",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4594510",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-17T13:12:21.284Z",
            "documentDate": "2026-08-17T13:12:25.744Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Stas",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786972345744,
                    "orderId": "4594510",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786972350413,
                    "orderId": "4594510",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786973560042,
                    "orderId": "4594510",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786973561827,
                    "orderId": "4594510",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786974012959,
                    "orderId": "4594510",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786974013613,
                    "orderId": "4594510",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "593B7",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "593B7",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786972949000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "17/08/2026 14:22",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4593020",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-16T20:58:32.579Z",
            "documentDate": "2026-08-16T20:58:38.646Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "M�rio",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786913918646,
                    "orderId": "4593020",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786913924366,
                    "orderId": "4593020",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786914522737,
                    "orderId": "4593020",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786914914460,
                    "orderId": "4593020",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786914914985,
                    "orderId": "4593020",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F7110",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F7110",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786914547000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 22:09",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4592892",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-16T20:27:52.529Z",
            "documentDate": "2026-08-16T20:27:56.498Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Diogo",
            "lastName": "H.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786912076498,
                    "orderId": "4592892",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786912081827,
                    "orderId": "4592892",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786912574502,
                    "orderId": "4592892",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786914544902,
                    "orderId": "4592892",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786914545397,
                    "orderId": "4592892",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "79619",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "79619",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786912600000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 21:36",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4592781",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-16T19:57:21.295Z",
            "documentDate": "2026-08-16T19:57:25.728Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 46.7,
            "firstName": "Mafalda",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786910245728,
                    "orderId": "4592781",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786910250506,
                    "orderId": "4592781",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786911346152,
                    "orderId": "4592781",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786912580952,
                    "orderId": "4592781",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786912582054,
                    "orderId": "4592781",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786912582922,
                    "orderId": "4592781",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101745438286-318",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101745438286-318",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786911159000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 21:12",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4592546",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-16T18:53:51.883Z",
            "documentDate": "2026-08-16T18:53:55.557Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tuna e Mayo S",
                    "plu": "ITM-902166555",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "+ Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 16.4,
            "firstName": "Kevin",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786906435557,
                    "orderId": "4592546",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786906440733,
                    "orderId": "4592546",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786907426297,
                    "orderId": "4592546",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786907767670,
                    "orderId": "4592546",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786907768789,
                    "orderId": "4592546",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101745328338-897",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101745328338-897",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786906993000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 20:03",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": "Alergy Info: Sem cebola roxa"
            }
        },
        {
            "orderId": "4592402",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-16T18:17:41.784Z",
            "documentDate": "2026-08-16T18:17:45.569Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Sweet Smoked Shrimp S",
                    "plu": "ITM-506707618",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Alyona",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786904265569,
                    "orderId": "4592402",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786904270555,
                    "orderId": "4592402",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786905118384,
                    "orderId": "4592402",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786905527815,
                    "orderId": "4592402",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786905528296,
                    "orderId": "4592402",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "A332C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "A332C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786905229000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 19:33",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4592058",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-16T17:13:39.517Z",
            "documentDate": "2026-08-16T17:13:43.767Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Sergio",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786900423767,
                    "orderId": "4592058",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786900428953,
                    "orderId": "4592058",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901780496,
                    "orderId": "4592058",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901784951,
                    "orderId": "4592058",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901785485,
                    "orderId": "4592058",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101745151737-509",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101745151737-509",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786901182000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 18:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4591961",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-16T16:58:13.227Z",
            "documentDate": "2026-08-16T16:58:17.253Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Thais",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786899497253,
                    "orderId": "4591961",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786899501942,
                    "orderId": "4591961",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786900597317,
                    "orderId": "4591961",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901786754,
                    "orderId": "4591961",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901787696,
                    "orderId": "4591961",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "DBFC7",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "DBFC7",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786900096000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 18:08",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4591855",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-16T16:30:35.543Z",
            "documentDate": "2026-08-16T16:30:39.769Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Colin",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786897839769,
                    "orderId": "4591855",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786897844453,
                    "orderId": "4591855",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786898537022,
                    "orderId": "4591855",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901827713,
                    "orderId": "4591855",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786901828976,
                    "orderId": "4591855",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "0C58D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "0C58D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786898441000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 17:40",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4590977",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-16T13:19:46.722Z",
            "documentDate": "2026-08-16T13:19:50.945Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-469585237",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "Michele",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786886390945,
                    "orderId": "4590977",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786886395734,
                    "orderId": "4590977",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786887351230,
                    "orderId": "4590977",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786887901594,
                    "orderId": "4590977",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786887902035,
                    "orderId": "4590977",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101744893665-369",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101744893665-369",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786886955000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 14:29",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4590370",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-16T11:41:36.926Z",
            "documentDate": "2026-08-16T11:41:40.681Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Kristin",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786880500681,
                    "orderId": "4590370",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786880505488,
                    "orderId": "4590370",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786881133701,
                    "orderId": "4590370",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786885697001,
                    "orderId": "4590370",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786885699158,
                    "orderId": "4590370",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101744763692-186",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101744763692-186",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786880964000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "16/08/2026 12:49",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4588679",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-15T21:17:01.358Z",
            "documentDate": "2026-08-15T21:17:05.843Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Valerie",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786828625843,
                    "orderId": "4588679",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786828630668,
                    "orderId": "4588679",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786829060906,
                    "orderId": "4588679",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786829061361,
                    "orderId": "4588679",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786829062351,
                    "orderId": "4588679",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786831422137,
                    "orderId": "4588679",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786831422475,
                    "orderId": "4588679",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "8CD6D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "8CD6D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786829199000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "15/08/2026 22:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4588059",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-15T19:21:19.117Z",
            "documentDate": "2026-08-15T19:21:24.359Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Helena",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786821684359,
                    "orderId": "4588059",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786821689293,
                    "orderId": "4588059",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786822933163,
                    "orderId": "4588059",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786828644028,
                    "orderId": "4588059",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786828644346,
                    "orderId": "4588059",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "05FED",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "05FED",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786822432000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "15/08/2026 20:33",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4585564",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-15T11:02:35.233Z",
            "documentDate": "2026-08-15T11:02:38.956Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Josh",
            "lastName": "H.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786791758956,
                    "orderId": "4585564",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786791763966,
                    "orderId": "4585564",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786799800669,
                    "orderId": "4585564",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786799838598,
                    "orderId": "4585564",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786799839845,
                    "orderId": "4585564",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "5B37E",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "5B37E",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786792577000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "15/08/2026 12:16",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4584251",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-14T21:26:05.937Z",
            "documentDate": "2026-08-14T21:26:10.616Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Ice Tea Lipton P�ssego 33cl",
                    "plu": "ITM-1169229135",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Francisca",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786742770616,
                    "orderId": "4584251",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786742775778,
                    "orderId": "4584251",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786743436565,
                    "orderId": "4584251",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786743639430,
                    "orderId": "4584251",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786743640589,
                    "orderId": "4584251",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "55C53",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "55C53",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786743433000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "14/08/2026 22:37",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4583817",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-14T20:15:06.481Z",
            "documentDate": "2026-08-14T20:15:11.577Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 43.7,
            "firstName": "Daniel",
            "lastName": "G.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786738511577,
                    "orderId": "4583817",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786738516985,
                    "orderId": "4583817",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786739436152,
                    "orderId": "4583817",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786742774880,
                    "orderId": "4583817",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786742775440,
                    "orderId": "4583817",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101743443530-821",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101743443530-821",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786739376000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "14/08/2026 21:29",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4583409",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-14T19:17:35.334Z",
            "documentDate": "2026-08-14T19:17:40.969Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "+ Focaccia de Doce de Leite e Banana XS",
                    "plu": "",
                    "price": 8.9,
                    "count": 1
                }
            ],
            "total": 27.299999999999997,
            "firstName": "Nuno",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786735060969,
                    "orderId": "4583409",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786735066828,
                    "orderId": "4583409",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786735742726,
                    "orderId": "4583409",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786736385098,
                    "orderId": "4583409",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786736385723,
                    "orderId": "4583409",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "3F0AA",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "260519022",
                "AM_PROVIDER_ORDER_ID": "3F0AA",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786735704000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "14/08/2026 20:28",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4582016",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-14T14:06:08.917Z",
            "documentDate": "2026-08-14T14:06:13.869Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Patricia",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786716373869,
                    "orderId": "4582016",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786716378830,
                    "orderId": "4582016",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786717460370,
                    "orderId": "4582016",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786717561145,
                    "orderId": "4582016",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786717562040,
                    "orderId": "4582016",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "95541",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "95541",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786717230000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "14/08/2026 15:20",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4581762",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-14T12:41:01.526Z",
            "documentDate": "2026-08-14T12:41:05.850Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Estrella Galicia Especial",
                    "plu": "",
                    "price": 3.5,
                    "count": 2
                }
            ],
            "total": 25.4,
            "firstName": "Joel",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786711265850,
                    "orderId": "4581762",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786711270861,
                    "orderId": "4581762",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786711613477,
                    "orderId": "4581762",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786712923281,
                    "orderId": "4581762",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786712924615,
                    "orderId": "4581762",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "BA1D8",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "BA1D8",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786711945000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "14/08/2026 13:52",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4578905",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-13T18:55:33.679Z",
            "documentDate": "2026-08-13T18:55:37.926Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Kristin",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786647337926,
                    "orderId": "4578905",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786647343033,
                    "orderId": "4578905",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786647984231,
                    "orderId": "4578905",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648196761,
                    "orderId": "4578905",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648208478,
                    "orderId": "4578905",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101742404061-141",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101742404061-141",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786647990000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "13/08/2026 20:06",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4578884",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-13T18:51:57.899Z",
            "documentDate": "2026-08-13T18:52:03.104Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Tuna e Mayo S",
                    "plu": "ITM-902166555",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 43.7,
            "firstName": "Oskar",
            "lastName": "G.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786647123104,
                    "orderId": "4578884",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786647125169,
                    "orderId": "4578884",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786647127598,
                    "orderId": "4578884",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648117886,
                    "orderId": "4578884",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786649406340,
                    "orderId": "4578884",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786649406912,
                    "orderId": "4578884",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "A3223",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "A3223",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786648019000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "13/08/2026 20:06",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4578845",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-13T18:45:14.005Z",
            "documentDate": "2026-08-13T18:45:30.716Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "gon�alo",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786646723833,
                    "orderId": "4578845",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1786646730716,
                    "orderId": "4578845",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786647734524,
                    "orderId": "4578845",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648202982,
                    "orderId": "4578845",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648203711,
                    "orderId": "4578845",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "21693",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "21693",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786647415000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "13/08/2026 19:56",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4578794",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-13T18:36:07.007Z",
            "documentDate": "2026-08-13T18:36:11.411Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Helena",
            "lastName": "F.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786646171411,
                    "orderId": "4578794",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786646176162,
                    "orderId": "4578794",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786646696803,
                    "orderId": "4578794",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786646697858,
                    "orderId": "4578794",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648206579,
                    "orderId": "4578794",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648207364,
                    "orderId": "4578794",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101742376436-540",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101742376436-540",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786646823000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "13/08/2026 19:47",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4577306",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-13T13:18:48.556Z",
            "documentDate": "2026-08-13T13:18:53.347Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Estrella Galicia Especial",
                    "plu": "",
                    "price": 3.5,
                    "count": 1
                }
            ],
            "total": 19.4,
            "firstName": "Stas",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786627133347,
                    "orderId": "4577306",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786627138179,
                    "orderId": "4577306",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786627966658,
                    "orderId": "4577306",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786627967745,
                    "orderId": "4577306",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648205248,
                    "orderId": "4577306",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786648205955,
                    "orderId": "4577306",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "2329A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "2329A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786627648000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "13/08/2026 14:27",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4575155",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-12T21:21:05.939Z",
            "documentDate": "2026-08-12T21:21:12.911Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Brigadeiro L",
                    "plu": "ITM-1581974950",
                    "price": 17.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-469585237",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 43.9,
            "firstName": "Eduardo",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786569672911,
                    "orderId": "4575155",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786569678216,
                    "orderId": "4575155",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786570593960,
                    "orderId": "4575155",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786649407611,
                    "orderId": "4575155",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786649408240,
                    "orderId": "4575155",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101741639875-552",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101741639875-552",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786569886000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 22:24",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4575122",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-12T21:15:22.794Z",
            "documentDate": "2026-08-12T21:15:27.704Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-469585237",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "Amir",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786569327704,
                    "orderId": "4575122",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786569332883,
                    "orderId": "4575122",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786570137813,
                    "orderId": "4575122",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786649405003,
                    "orderId": "4575122",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786649405574,
                    "orderId": "4575122",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101741636459-398",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101741636459-398",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786569777000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 22:22",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4574958",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-12T20:42:37.480Z",
            "documentDate": "2026-08-12T20:42:42.145Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Felipe",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786567362145,
                    "orderId": "4574958",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786567366836,
                    "orderId": "4574958",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786568489477,
                    "orderId": "4574958",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786568538396,
                    "orderId": "4574958",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786568539213,
                    "orderId": "4574958",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "D39C9",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "518423832",
                "AM_PROVIDER_ORDER_ID": "D39C9",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786568051000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 21:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4574476",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-12T18:54:22.477Z",
            "documentDate": "2026-08-12T18:54:26.723Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Andr�",
            "lastName": "F.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786560866723,
                    "orderId": "4574476",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786560871703,
                    "orderId": "4574476",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786562035894,
                    "orderId": "4574476",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786562355505,
                    "orderId": "4574476",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786562356051,
                    "orderId": "4574476",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "7CB43",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "273919890",
                "AM_PROVIDER_ORDER_ID": "7CB43",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786561425000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 20:03",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4574437",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-12T18:42:23.530Z",
            "documentDate": "2026-08-12T18:42:28.757Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Alisha",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786560148757,
                    "orderId": "4574437",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786560153298,
                    "orderId": "4574437",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786562028108,
                    "orderId": "4574437",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786562028880,
                    "orderId": "4574437",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786562354419,
                    "orderId": "4574437",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101741468479-118",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101741468479-118",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786560979000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 19:56",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4574304",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-12T18:12:18.474Z",
            "documentDate": "2026-08-12T18:12:22.564Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Li",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786558342564,
                    "orderId": "4574304",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786558347940,
                    "orderId": "4574304",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786558966777,
                    "orderId": "4574304",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786559131193,
                    "orderId": "4574304",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786559134264,
                    "orderId": "4574304",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "0013D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "0013D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786559174000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 19:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4573969",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-12T16:51:37.270Z",
            "documentDate": "2026-08-12T16:51:43.857Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Teresa",
            "lastName": "H.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786553503857,
                    "orderId": "4573969",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786553509555,
                    "orderId": "4573969",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786554768718,
                    "orderId": "4573969",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786555081236,
                    "orderId": "4573969",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786555322842,
                    "orderId": "4573969",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786555323551,
                    "orderId": "4573969",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "8DC26",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "8DC26",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786553786000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 17:56",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4573291",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-12T13:41:12.543Z",
            "documentDate": "2026-08-12T13:41:17.094Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Jo�o",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786542077094,
                    "orderId": "4573291",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786542082406,
                    "orderId": "4573291",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786543009384,
                    "orderId": "4573291",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786543204485,
                    "orderId": "4573291",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786543207092,
                    "orderId": "4573291",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F457D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "262103680",
                "AM_PROVIDER_ORDER_ID": "F457D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786542639000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "12/08/2026 14:50",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4571020",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T21:18:06.180Z",
            "documentDate": "2026-08-11T21:18:10.318Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786483090318,
                    "orderId": "4571020",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786483095286,
                    "orderId": "4571020",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786483946726,
                    "orderId": "4571020",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786484650452,
                    "orderId": "4571020",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786484651094,
                    "orderId": "4571020",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "CD051",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "CD051",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786483675000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 22:27",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4570935",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T21:02:31.752Z",
            "documentDate": "2026-08-11T21:02:36.419Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "+ Ice Tea Lipton Lim�o 33cl",
                    "plu": "ITM-282852344",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 33.4,
            "firstName": "Miguel",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786482156419,
                    "orderId": "4570935",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786482161548,
                    "orderId": "4570935",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786483270578,
                    "orderId": "4570935",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786484631563,
                    "orderId": "4570935",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786484642993,
                    "orderId": "4570935",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786484649294,
                    "orderId": "4570935",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "D6FE7",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "D6FE7",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786482774000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 22:12",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4570543",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T19:50:35.482Z",
            "documentDate": "2026-08-11T19:50:40.018Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese L",
                    "plu": "ITM-1168202192",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 51.8,
            "firstName": "Karolyne",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786477840018,
                    "orderId": "4570543",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786477845025,
                    "orderId": "4570543",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479158706,
                    "orderId": "4570543",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479903212,
                    "orderId": "4570543",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479903778,
                    "orderId": "4570543",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "89351",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "89351",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786478750000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 21:05",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4570399",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T19:21:02.370Z",
            "documentDate": "2026-08-11T19:21:07.124Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Filipa",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786476067124,
                    "orderId": "4570399",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786476072156,
                    "orderId": "4570399",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786477130049,
                    "orderId": "4570399",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479901904,
                    "orderId": "4570399",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479902490,
                    "orderId": "4570399",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "EEAAE",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "241863201",
                "AM_PROVIDER_ORDER_ID": "EEAAE",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786476766000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 20:32",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4570387",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T19:18:42.537Z",
            "documentDate": "2026-08-11T19:18:47.637Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Ice Tea Lipton Lim�o 33cl",
                    "plu": "ITM-282852344",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 36.8,
            "firstName": "JONATHAN",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786475927637,
                    "orderId": "4570387",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786475933483,
                    "orderId": "4570387",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786477113762,
                    "orderId": "4570387",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479900520,
                    "orderId": "4570387",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479901094,
                    "orderId": "4570387",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "CBE89",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "CBE89",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786476425000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 20:27",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4570383",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T19:18:10.451Z",
            "documentDate": "2026-08-11T19:18:17.879Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 45.7,
            "firstName": "Pedro",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786475897879,
                    "orderId": "4570383",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786475902801,
                    "orderId": "4570383",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786477096386,
                    "orderId": "4570383",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479898671,
                    "orderId": "4570383",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786479899520,
                    "orderId": "4570383",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "7319C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "7319C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786476703000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 20:31",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4569935",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T17:36:05.915Z",
            "documentDate": "2026-08-11T17:36:10.945Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "John",
            "lastName": "W.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786469770945,
                    "orderId": "4569935",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786469775738,
                    "orderId": "4569935",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786470547446,
                    "orderId": "4569935",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786470549254,
                    "orderId": "4569935",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786471725904,
                    "orderId": "4569935",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786471726438,
                    "orderId": "4569935",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "7EE8A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "7EE8A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786470204000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 18:43",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4569885",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T17:21:31.866Z",
            "documentDate": "2026-08-11T17:21:36.816Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 32.3,
            "firstName": "Kristina",
            "lastName": "F.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786468896816,
                    "orderId": "4569885",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786468899938,
                    "orderId": "4569885",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786468901635,
                    "orderId": "4569885",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786469628590,
                    "orderId": "4569885",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786469633870,
                    "orderId": "4569885",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786471724375,
                    "orderId": "4569885",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786471725015,
                    "orderId": "4569885",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "BB036",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "BB036",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786469640000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 18:34",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4568890",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-11T12:49:20.884Z",
            "documentDate": "2026-08-11T12:49:25.162Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Melissa",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786452565162,
                    "orderId": "4568890",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786452570014,
                    "orderId": "4568890",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786454819483,
                    "orderId": "4568890",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786454820285,
                    "orderId": "4568890",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786454821225,
                    "orderId": "4568890",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "6C4A1",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "244768943",
                "AM_PROVIDER_ORDER_ID": "6C4A1",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786453451000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 14:04",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4568486",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-11T11:20:34.326Z",
            "documentDate": "2026-08-11T11:20:39.160Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-469585237",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 23.5,
            "firstName": "Filipe",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786447239160,
                    "orderId": "4568486",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786447243858,
                    "orderId": "4568486",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786447852994,
                    "orderId": "4568486",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786448206349,
                    "orderId": "4568486",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786448207320,
                    "orderId": "4568486",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101740103590-288",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101740103590-288",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786447829000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "11/08/2026 12:30",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4566647",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-10T20:41:05.227Z",
            "documentDate": "2026-08-10T20:41:09.184Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Estrella Galicia Especial",
                    "plu": "",
                    "price": 3.5,
                    "count": 2
                }
            ],
            "total": 22.9,
            "firstName": "Pedro",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786394469184,
                    "orderId": "4566647",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786394475253,
                    "orderId": "4566647",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786396287593,
                    "orderId": "4566647",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786396740322,
                    "orderId": "4566647",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786396740884,
                    "orderId": "4566647",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "692C9",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "692C9",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786394953000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "10/08/2026 21:49",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4566603",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-10T20:33:54.080Z",
            "documentDate": "2026-08-10T20:34:00.080Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Desconto",
                    "plu": "AM_DISCOUNT",
                    "price": 0,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms S",
                    "plu": "ITM-1435130297",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 43.7,
            "firstName": "Yaroslav",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786394040080,
                    "orderId": "4566603",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786395305394,
                    "orderId": "4566603",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786394048259,
                    "orderId": "4566603",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786396286770,
                    "orderId": "4566603",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786396739315,
                    "orderId": "4566603",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786396741671,
                    "orderId": "4566603",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101739816872-739",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101739816872-739",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786394930000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "10/08/2026 21:48",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4566316",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-10T19:46:01.057Z",
            "documentDate": "2026-08-10T19:46:06.050Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Brigadeiro S",
                    "plu": "ITM-1581974950",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 30.3,
            "firstName": "Nuno",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786391166050,
                    "orderId": "4566316",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786391171361,
                    "orderId": "4566316",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786391988218,
                    "orderId": "4566316",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786391990124,
                    "orderId": "4566316",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786391992275,
                    "orderId": "4566316",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F140A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F140A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786391931000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "10/08/2026 20:58",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4564301",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-10T11:58:57.694Z",
            "documentDate": "2026-08-10T11:59:01.921Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Pedro",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786363141921,
                    "orderId": "4564301",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786363146826,
                    "orderId": "4564301",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786363859293,
                    "orderId": "4564301",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786363947179,
                    "orderId": "4564301",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786363948322,
                    "orderId": "4564301",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101739248621-658",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101739248621-658",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786363853000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "10/08/2026 13:10",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4563291",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-09T21:29:33.921Z",
            "documentDate": "2026-08-09T21:29:38.267Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese L",
                    "plu": "ITM-1168202192",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 41.8,
            "firstName": "Roberta",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786310978267,
                    "orderId": "4563291",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786310982920,
                    "orderId": "4563291",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786311609115,
                    "orderId": "4563291",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786311842153,
                    "orderId": "4563291",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786311842608,
                    "orderId": "4563291",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "7BC4C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "7BC4C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786311425000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "09/08/2026 22:37",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4562928",
            "platform": "Bolt Food",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Bolt",
            "orderDate": "2026-08-09T20:07:48.451Z",
            "documentDate": "2026-08-09T20:07:52.206Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Joana",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786306072206,
                    "orderId": "4562928",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786306077130,
                    "orderId": "4562928",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "info@airmenu.com",
                    "datetime": 1786306334446,
                    "orderId": "4562928",
                    "key": "PICKING_UP",
                    "operator": "Rui Oliveira"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786307091660,
                    "orderId": "4562928",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786307558261,
                    "orderId": "4562928",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786307558948,
                    "orderId": "4562928",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "WSZOF",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "WSZOF",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786307113000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "09/08/2026 21:25",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "BoltFood",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4562882",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-09T19:58:11.788Z",
            "documentDate": "2026-08-09T19:58:16.530Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 2
                },
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 2
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 35.9,
            "firstName": "Pedro",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786305496530,
                    "orderId": "4562882",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786305501676,
                    "orderId": "4562882",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786306655192,
                    "orderId": "4562882",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786307098046,
                    "orderId": "4562882",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786307098712,
                    "orderId": "4562882",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "bianca@airmenu.com",
                    "datetime": 1786455437020,
                    "orderId": "4562882",
                    "key": "Faturar",
                    "operator": "Bianca Bacic"
                }
            ],
            "providerOrderId": "101738865151-725",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "517714051",
                "AM_PROVIDER_ORDER_ID": "101738865151-725",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786306408000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "09/08/2026 21:13",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4561856",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-09T16:43:01.369Z",
            "documentDate": "2026-08-09T16:43:01.369Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese L",
                    "plu": "ITM-980595824",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 51.8,
            "firstName": "Arkadiusz",
            "lastName": "B.",
            "activeFlags": [],
            "providerOrderId": "101738553925-548",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101738553925-548",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786294797000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "09/08/2026 17:59",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4561029",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-09T14:20:59.166Z",
            "documentDate": "2026-08-09T14:21:03.426Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 45.7,
            "firstName": "Nuno",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786285263426,
                    "orderId": "4561029",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786285266888,
                    "orderId": "4561029",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786286278020,
                    "orderId": "4561029",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786287286433,
                    "orderId": "4561029",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786287286771,
                    "orderId": "4561029",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "B0693",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "B0693",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786286208000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "09/08/2026 15:36",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4559875",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-09T11:09:02.466Z",
            "documentDate": "2026-08-09T11:09:07.040Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Kristin",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786273747040,
                    "orderId": "4559875",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786273748805,
                    "orderId": "4559875",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786273751503,
                    "orderId": "4559875",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786274528830,
                    "orderId": "4559875",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786274869675,
                    "orderId": "4559875",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786274870590,
                    "orderId": "4559875",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101738149582-403",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101738149582-403",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786274398000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "09/08/2026 12:19",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4558417",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T21:23:53.948Z",
            "documentDate": "2026-08-08T21:23:59.349Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 34.8,
            "firstName": "Pedro",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786224239349,
                    "orderId": "4558417",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786224243361,
                    "orderId": "4558417",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786225367333,
                    "orderId": "4558417",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786273753119,
                    "orderId": "4558417",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786273754228,
                    "orderId": "4558417",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "F820D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "F820D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786225107000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 22:38",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4557979",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T20:09:02.698Z",
            "documentDate": "2026-08-08T20:09:07.564Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Seven Up 33cl",
                    "plu": "ITM-1659767771",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Joaquim",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786219747564,
                    "orderId": "4557979",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786219752227,
                    "orderId": "4557979",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220234567,
                    "orderId": "4557979",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786221257597,
                    "orderId": "4557979",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786221258171,
                    "orderId": "4557979",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "33E02",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "33E02",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786220477000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 21:21",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4557666",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T19:16:02.092Z",
            "documentDate": "2026-08-08T19:16:06.050Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 39.8,
            "firstName": "Carla",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786216566050,
                    "orderId": "4557666",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786216569377,
                    "orderId": "4557666",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786216570993,
                    "orderId": "4557666",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786217501209,
                    "orderId": "4557666",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220333427,
                    "orderId": "4557666",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220334199,
                    "orderId": "4557666",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "14708",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "224706659",
                "AM_PROVIDER_ORDER_ID": "14708",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786217161000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 20:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4557641",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T19:12:37.836Z",
            "documentDate": "2026-08-08T19:12:42.346Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "+ Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Liliana",
            "lastName": "P.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786216362346,
                    "orderId": "4557641",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786216367472,
                    "orderId": "4557641",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786218154207,
                    "orderId": "4557641",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220330859,
                    "orderId": "4557641",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220331669,
                    "orderId": "4557641",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "CD31B",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "CD31B",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786216977000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 20:22",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4557581",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T19:04:51.363Z",
            "documentDate": "2026-08-08T19:04:56.871Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 45.7,
            "firstName": "Flavia",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786215896871,
                    "orderId": "4557581",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786215902339,
                    "orderId": "4557581",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786216882601,
                    "orderId": "4557581",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786216883910,
                    "orderId": "4557581",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220328905,
                    "orderId": "4557581",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786220329739,
                    "orderId": "4557581",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "0EB3B",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "0EB3B",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786216803000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 20:20",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4557379",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T18:29:05.560Z",
            "documentDate": "2026-08-08T18:29:09.733Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Vinicius",
            "lastName": "G.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786213749733,
                    "orderId": "4557379",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786213754501,
                    "orderId": "4557379",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786214575073,
                    "orderId": "4557379",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786216892068,
                    "orderId": "4557379",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786216892675,
                    "orderId": "4557379",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "A2AF3",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "A2AF3",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786214410000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 19:40",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4557148",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T17:47:05.281Z",
            "documentDate": "2026-08-08T17:47:11.100Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 31.8,
            "firstName": "Michael",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786211231100,
                    "orderId": "4557148",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786211235856,
                    "orderId": "4557148",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786212086743,
                    "orderId": "4557148",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786212087999,
                    "orderId": "4557148",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786212088554,
                    "orderId": "4557148",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "EF057",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "EF057",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786212102000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 19:01",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4556107",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-08T14:07:03.181Z",
            "documentDate": "2026-08-08T14:07:12.169Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Elya",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786198032169,
                    "orderId": "4556107",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786198037275,
                    "orderId": "4556107",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786198787040,
                    "orderId": "4556107",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786198793346,
                    "orderId": "4556107",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786198967831,
                    "orderId": "4556107",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786198968392,
                    "orderId": "4556107",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "44B67",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "44B67",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786198624000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 15:17",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4555460",
            "platform": "Bolt Food",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Bolt",
            "orderDate": "2026-08-08T11:59:41.034Z",
            "documentDate": "2026-08-08T11:59:46.678Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Sweet Smoked Shrimp S",
                    "plu": "ITM-506707618",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "George",
            "lastName": "G.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786190386678,
                    "orderId": "4555460",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786190392600,
                    "orderId": "4555460",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786191579943,
                    "orderId": "4555460",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786192196116,
                    "orderId": "4555460",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786192197336,
                    "orderId": "4555460",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "99Q1N",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "307575268",
                "AM_PROVIDER_ORDER_ID": "99Q1N",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786191493000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "08/08/2026 13:18",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "BoltFood",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4553729",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-07T21:03:03.056Z",
            "documentDate": "2026-08-07T21:03:03.056Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Arkadiusz",
            "lastName": "B.",
            "activeFlags": [],
            "providerOrderId": "101736884380-629",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101736884380-629",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786137420000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "07/08/2026 22:17",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4552792",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-07T18:45:56.329Z",
            "documentDate": "2026-08-07T18:46:00.690Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Ricardo",
            "lastName": "J.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786128360690,
                    "orderId": "4552792",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786128365344,
                    "orderId": "4552792",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786129104366,
                    "orderId": "4552792",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786132634357,
                    "orderId": "4552792",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786132635782,
                    "orderId": "4552792",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "6CB87",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "260043893",
                "AM_PROVIDER_ORDER_ID": "6CB87",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786129143000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "07/08/2026 19:59",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4549554",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-06T22:13:47.760Z",
            "documentDate": "2026-08-06T22:13:52.298Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Erro Pedido",
                    "plu": "AM_ERROR",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 0,
            "firstName": "Arkadiusz",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786054432298,
                    "orderId": "4549554",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786054437063,
                    "orderId": "4549554",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786054963653,
                    "orderId": "4549554",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786054984182,
                    "orderId": "4549554",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786100693898,
                    "orderId": "4549554",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786100694448,
                    "orderId": "4549554",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101735924190-709",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101735924190-709",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786055203000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 23:26",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4549449",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-06T21:51:25.475Z",
            "documentDate": "2026-08-06T21:51:30.321Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Erro Pedido",
                    "plu": "AM_ERROR",
                    "price": 0,
                    "count": 1
                }
            ],
            "total": 0,
            "firstName": "Kevin",
            "lastName": "B.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786053090321,
                    "orderId": "4549449",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786053095006,
                    "orderId": "4549449",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786054752500,
                    "orderId": "4549449",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786054758774,
                    "orderId": "4549449",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786100692201,
                    "orderId": "4549449",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786100692734,
                    "orderId": "4549449",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101735915017-195",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101735915017-195",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786053861000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 23:04",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4549342",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-06T21:23:09.010Z",
            "documentDate": "2026-08-06T21:23:14.102Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Gabriele",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786051394102,
                    "orderId": "4549342",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786051399016,
                    "orderId": "4549342",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786052140237,
                    "orderId": "4549342",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786052223913,
                    "orderId": "4549342",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786052224944,
                    "orderId": "4549342",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "41C5A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "41C5A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786052449000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 22:40",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4549332",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-06T21:21:45.895Z",
            "documentDate": "2026-08-06T21:21:50.409Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786051310409,
                    "orderId": "4549332",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786051315387,
                    "orderId": "4549332",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786051954573,
                    "orderId": "4549332",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786051957397,
                    "orderId": "4549332",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786052217717,
                    "orderId": "4549332",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786052219424,
                    "orderId": "4549332",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "BE2EB",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "BE2EB",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786051902000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 22:31",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4549310",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-06T21:17:23.902Z",
            "documentDate": "2026-08-06T21:17:29.406Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 3
                },
                {
                    "title": "4 Formaggios L",
                    "plu": "ITM-814113584",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-1911436907",
                    "price": 23.5,
                    "count": 1
                }
            ],
            "total": 56.9,
            "firstName": "M�rcia",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786051049406,
                    "orderId": "4549310",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786051054057,
                    "orderId": "4549310",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786051062957,
                    "orderId": "4549310",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786052376790,
                    "orderId": "4549310",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786100690635,
                    "orderId": "4549310",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786100691391,
                    "orderId": "4549310",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "bianca@airmenu.com",
                    "datetime": 1786455420541,
                    "orderId": "4549310",
                    "key": "Faturar",
                    "operator": "Bianca Bacic"
                }
            ],
            "providerOrderId": "101735896781-789",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101735896781-789",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786052051000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 22:34",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4549084",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-06T20:26:05.030Z",
            "documentDate": "2026-08-06T20:26:10.100Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese L",
                    "plu": "ITM-1168202192",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Reynold Alejandro",
            "lastName": "O.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786047970100,
                    "orderId": "4549084",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786047974403,
                    "orderId": "4549084",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786048012365,
                    "orderId": "4549084",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786049796556,
                    "orderId": "4549084",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786049797925,
                    "orderId": "4549084",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "E4760",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "E4760",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786048272000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 21:31",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4548902",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-06T19:47:00.255Z",
            "documentDate": "2026-08-06T19:47:05.388Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 30.299999999999997,
            "firstName": "Mariana",
            "lastName": "M.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786045625388,
                    "orderId": "4548902",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786045629874,
                    "orderId": "4548902",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046135921,
                    "orderId": "4548902",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046930931,
                    "orderId": "4548902",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046931624,
                    "orderId": "4548902",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "A7D15",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "A7D15",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786046248000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 20:57",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4548709",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-06T19:09:10.509Z",
            "documentDate": "2026-08-06T19:09:16.671Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Doce de Leite & Banana S",
                    "plu": "ITM-1204180063",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 41.7,
            "firstName": "millie",
            "lastName": "W.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786043356671,
                    "orderId": "4548709",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786043361424,
                    "orderId": "4548709",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786043489407,
                    "orderId": "4548709",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046933577,
                    "orderId": "4548709",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046934191,
                    "orderId": "4548709",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "6D59C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "6D59C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786043986000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 20:19",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4548602",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-06T18:43:29.693Z",
            "documentDate": "2026-08-06T18:43:34.283Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-12465001",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Luana",
            "lastName": "V.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1786041814283,
                    "orderId": "4548602",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1786041821209,
                    "orderId": "4548602",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786044176803,
                    "orderId": "4548602",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786044255679,
                    "orderId": "4548602",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786044258596,
                    "orderId": "4548602",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046928680,
                    "orderId": "4548602",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1786046932401,
                    "orderId": "4548602",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "8F783",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "8F783",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1786042459000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "06/08/2026 19:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4545216",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-05T20:57:23.146Z",
            "documentDate": "2026-08-05T20:57:26.562Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "�gua mineral 51cl",
                    "plu": "",
                    "price": 2,
                    "count": 1
                }
            ],
            "total": 2,
            "firstName": "Raul",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785963446562,
                    "orderId": "4545216",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785963452747,
                    "orderId": "4545216",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "general@angrybox.pt",
                    "datetime": 1785963496704,
                    "orderId": "4545216",
                    "key": "READY",
                    "operator": "Adm AngryBox"
                },
                {
                    "operatorEmail": "general@angrybox.pt",
                    "datetime": 1785963804227,
                    "orderId": "4545216",
                    "key": "PICKED",
                    "operator": "Adm AngryBox"
                },
                {
                    "operatorEmail": "general@angrybox.pt",
                    "datetime": 1785963810601,
                    "orderId": "4545216",
                    "key": "FINISHED",
                    "operator": "Adm AngryBox"
                }
            ],
            "providerOrderId": "FC469",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "FC469",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785963499000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "05/08/2026 21:58",
                "AM_ORDER_TYPE": "PICK_UP",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4544677",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-05T19:12:40.671Z",
            "documentDate": "2026-08-05T19:12:44.304Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 29.8,
            "firstName": "Filipe",
            "lastName": "C.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785957164304,
                    "orderId": "4544677",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785957169184,
                    "orderId": "4544677",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785957281706,
                    "orderId": "4544677",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785958102421,
                    "orderId": "4544677",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785958597097,
                    "orderId": "4544677",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785958597909,
                    "orderId": "4544677",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "01AD7",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "212485423",
                "AM_PROVIDER_ORDER_ID": "01AD7",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785957891000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "05/08/2026 20:24",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4542965",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-05T11:35:38.641Z",
            "documentDate": "2026-08-05T11:35:43.484Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Eduardo",
            "lastName": "S.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785929743484,
                    "orderId": "4542965",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785929748216,
                    "orderId": "4542965",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785937520777,
                    "orderId": "4542965",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785937521613,
                    "orderId": "4542965",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785937522697,
                    "orderId": "4542965",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "77B9C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "77B9C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785930288000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "05/08/2026 12:44",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4541629",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-04T21:24:40.958Z",
            "documentDate": "2026-08-04T21:24:43.810Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Leonardo",
            "lastName": "V.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785878683810,
                    "orderId": "4541629",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785878688888,
                    "orderId": "4541629",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785880735128,
                    "orderId": "4541629",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785880740983,
                    "orderId": "4541629",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785880741666,
                    "orderId": "4541629",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "8773C",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "8773C",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785879303000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 22:35",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4541625",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-04T21:23:51.114Z",
            "documentDate": "2026-08-04T21:23:55.569Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "4 Formaggios S",
                    "plu": "ITM-653942416",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 15.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785878635569,
                    "orderId": "4541625",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785878640301,
                    "orderId": "4541625",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785880237973,
                    "orderId": "4541625",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785880736438,
                    "orderId": "4541625",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785880739802,
                    "orderId": "4541625",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "9E6FE",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "9E6FE",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785879270000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 22:34",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4541412",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-04T20:30:52.484Z",
            "documentDate": "2026-08-04T20:30:56.870Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Doce de Leite & Banana S",
                    "plu": "ITM-1204180063",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese L",
                    "plu": "ITM-980595824",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Truffle Shrooms L",
                    "plu": "ITM-289626119",
                    "price": 23.5,
                    "count": 1
                }
            ],
            "total": 99.1,
            "firstName": "Ignacio",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785875456870,
                    "orderId": "4541412",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785875461707,
                    "orderId": "4541412",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785877057802,
                    "orderId": "4541412",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785879272912,
                    "orderId": "4541412",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785879421086,
                    "orderId": "4541412",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785879422254,
                    "orderId": "4541412",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "CF489",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "CF489",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785876483000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 21:48",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4540894",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-04T18:12:21.508Z",
            "documentDate": "2026-08-04T18:12:25.236Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "�gua Solan Cabras 33cl",
                    "plu": "ITM-470313752",
                    "price": 2,
                    "count": 1
                },
                {
                    "title": "4 Formaggios L",
                    "plu": "ITM-814113584",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 27.9,
            "firstName": "Izabel",
            "lastName": "N.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785867145236,
                    "orderId": "4540894",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785867150169,
                    "orderId": "4540894",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785868030037,
                    "orderId": "4540894",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785869283344,
                    "orderId": "4540894",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785868995718,
                    "orderId": "4540894",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785869284173,
                    "orderId": "4540894",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101733843552-833",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101733843552-833",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785867918000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 19:25",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4540207",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-04T13:43:10.833Z",
            "documentDate": "2026-08-04T13:43:14.096Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Jeppe",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785850994096,
                    "orderId": "4540207",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785850998832,
                    "orderId": "4540207",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785851768038,
                    "orderId": "4540207",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785851768873,
                    "orderId": "4540207",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853398230,
                    "orderId": "4540207",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853416602,
                    "orderId": "4540207",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "968A7",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "968A7",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785851611000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 14:53",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4540161",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-04T13:18:57.838Z",
            "documentDate": "2026-08-04T13:19:01.160Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "�gua Solan Cabras com g�s 33cl",
                    "plu": "ITM-39423294",
                    "price": 3.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Ice Tea Lipton Lim�o 33cl",
                    "plu": "ITM-282852344",
                    "price": 2.5,
                    "count": 1
                }
            ],
            "total": 21.9,
            "firstName": "Max",
            "lastName": "D.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785849541160,
                    "orderId": "4540161",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785849546282,
                    "orderId": "4540161",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785850364368,
                    "orderId": "4540161",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785851274845,
                    "orderId": "4540161",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853403036,
                    "orderId": "4540161",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853418530,
                    "orderId": "4540161",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "64562",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "64562",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785850297000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 14:31",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4539971",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-04T11:57:12.139Z",
            "documentDate": "2026-08-04T11:57:15.777Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                },
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 30.299999999999997,
            "firstName": "Jaxon",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785844635777,
                    "orderId": "4539971",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785844640948,
                    "orderId": "4539971",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785844700109,
                    "orderId": "4539971",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785847626810,
                    "orderId": "4539971",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785847632916,
                    "orderId": "4539971",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853399516,
                    "orderId": "4539971",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853417473,
                    "orderId": "4539971",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "0EA7F",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "0EA7F",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785845347000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 13:09",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4539910",
            "platform": "Glovo",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Glovo",
            "orderDate": "2026-08-04T11:34:44.908Z",
            "documentDate": "2026-08-04T11:34:48.923Z",
            "paymentMethod": "Money",
            "items": [
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 3
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 33.4,
            "firstName": "Jeremy",
            "lastName": "",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785843288923,
                    "orderId": "4539910",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785843293605,
                    "orderId": "4539910",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785844109867,
                    "orderId": "4539910",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785847627770,
                    "orderId": "4539910",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853379227,
                    "orderId": "4539910",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853401349,
                    "orderId": "4539910",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785853419280,
                    "orderId": "4539910",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "101733427646-558",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "101733427646-558",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785844121000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "04/08/2026 12:48",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "Glovo",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4538633",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-03T21:25:06.654Z",
            "documentDate": "2026-08-03T21:25:09.823Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic S",
                    "plu": "ITM-469585237",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785792309823,
                    "orderId": "4538633",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785792313819,
                    "orderId": "4538633",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785792991669,
                    "orderId": "4538633",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785792997620,
                    "orderId": "4538633",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785793747058,
                    "orderId": "4538633",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785793747618,
                    "orderId": "4538633",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "74F4A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "74F4A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785792790000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "03/08/2026 22:33",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4537107",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-03T13:19:57.671Z",
            "documentDate": "2026-08-03T13:20:01.530Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Creamy Garlic L",
                    "plu": "ITM-1911436907",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 49.4,
            "firstName": "Gon�alo",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785763201530,
                    "orderId": "4537107",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785780572256,
                    "orderId": "4537107",
                    "key": "ACCEPT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785780541609,
                    "orderId": "4537107",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785781490542,
                    "orderId": "4537107",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785781491136,
                    "orderId": "4537107",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "C423D",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "C423D",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785764339000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "03/08/2026 14:38",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4535956",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-02T21:22:13.024Z",
            "documentDate": "2026-08-02T21:22:16.677Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Tomate e Pesto S",
                    "plu": "ITM-880163054",
                    "price": 13.9,
                    "count": 1
                }
            ],
            "total": 13.9,
            "firstName": "Ahmet",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785705736677,
                    "orderId": "4535956",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785705742236,
                    "orderId": "4535956",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785706134685,
                    "orderId": "4535956",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785706595572,
                    "orderId": "4535956",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785706596197,
                    "orderId": "4535956",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "C7309",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "C7309",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785706396000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "02/08/2026 22:33",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4535830",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-02T20:45:25.216Z",
            "documentDate": "2026-08-02T20:45:28.494Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                }
            ],
            "total": 25.9,
            "firstName": "Pedro",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785703528494,
                    "orderId": "4535830",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785703533205,
                    "orderId": "4535830",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785704400089,
                    "orderId": "4535830",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785704555688,
                    "orderId": "4535830",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785704557085,
                    "orderId": "4535830",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "851A5",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "851A5",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785704006000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "02/08/2026 21:53",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4535506",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-02T19:30:43.250Z",
            "documentDate": "2026-08-02T19:30:46.684Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Cookies and Cream S",
                    "plu": "ITM-178495521",
                    "price": 11.9,
                    "count": 1
                }
            ],
            "total": 11.9,
            "firstName": "Bruno",
            "lastName": "A.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785699046684,
                    "orderId": "4535506",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785699051369,
                    "orderId": "4535506",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "general@angrybox.pt",
                    "datetime": 1785699552775,
                    "orderId": "4535506",
                    "key": "READY",
                    "operator": "Adm AngryBox"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785704405840,
                    "orderId": "4535506",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785704406478,
                    "orderId": "4535506",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "17477",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "17477",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785699343000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "02/08/2026 20:35",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4535244",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-02T18:39:25.672Z",
            "documentDate": "2026-08-02T18:39:29.574Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Brigadeiro S",
                    "plu": "ITM-1581974950",
                    "price": 11.9,
                    "count": 1
                },
                {
                    "title": "Chicken & Cheese S",
                    "plu": "ITM-1168202192",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 27.8,
            "firstName": "Marina",
            "lastName": "R.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785695969574,
                    "orderId": "4535244",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785695975471,
                    "orderId": "4535244",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "general@angrybox.pt",
                    "datetime": 1785696765045,
                    "orderId": "4535244",
                    "key": "READY",
                    "operator": "Adm AngryBox"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785697879602,
                    "orderId": "4535244",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785697880296,
                    "orderId": "4535244",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "FA22A",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "FA22A",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785696863000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "02/08/2026 19:54",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4531042",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-01T20:11:42.952Z",
            "documentDate": "2026-08-01T20:13:04.795Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Tomate e Pesto L",
                    "plu": "ITM-1249536430",
                    "price": 23.5,
                    "count": 1
                },
                {
                    "title": "Guaran� Ant�rtica 33cl",
                    "plu": "ITM-357623863",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni L",
                    "plu": "ITM-4138583",
                    "price": 25.9,
                    "count": 1
                },
                {
                    "title": "Coca-cola Zero 33cl",
                    "plu": "ITM-462578459",
                    "price": 2.5,
                    "count": 2
                }
            ],
            "total": 59.4,
            "firstName": "Yasmin",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785615112773,
                    "orderId": "4531042",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "",
                    "datetime": 1785615184795,
                    "orderId": "4531042",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785615948214,
                    "orderId": "4531042",
                    "key": "PRINT",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785615950862,
                    "orderId": "4531042",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785616684685,
                    "orderId": "4531042",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785616690654,
                    "orderId": "4531042",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "2DDDB",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "2DDDB",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785616169000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "01/08/2026 21:29",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        },
        {
            "orderId": "4529228",
            "platform": "Uber Eats",
            "divisionName": "Angry Box - Porto #|# Angry Box #|# Uber",
            "orderDate": "2026-08-01T14:04:24.941Z",
            "documentDate": "2026-08-01T14:04:28.199Z",
            "paymentMethod": "linkPayment#creditcard",
            "items": [
                {
                    "title": "Coca-cola 33cl",
                    "plu": "ITM-918194309",
                    "price": 2.5,
                    "count": 1
                },
                {
                    "title": "Honey Pepperoni S",
                    "plu": "ITM-12465001",
                    "price": 15.9,
                    "count": 1
                }
            ],
            "total": 18.4,
            "firstName": "Jaxon",
            "lastName": "L.",
            "activeFlags": [
                {
                    "operatorEmail": "",
                    "datetime": 1785593068199,
                    "orderId": "4529228",
                    "key": "FATURAR",
                    "operator": ""
                },
                {
                    "operatorEmail": "script@airmenu.com",
                    "datetime": 1785593072963,
                    "orderId": "4529228",
                    "key": "ACCEPT",
                    "operator": "script@airmenu.com"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785594011069,
                    "orderId": "4529228",
                    "key": "READY",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785595443866,
                    "orderId": "4529228",
                    "key": "PICKING_UP",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785595446334,
                    "orderId": "4529228",
                    "key": "PICKED",
                    "operator": "Angry Box Porto"
                },
                {
                    "operatorEmail": "angrybox@connect.airmenu.com",
                    "datetime": 1785595447119,
                    "orderId": "4529228",
                    "key": "FINISHED",
                    "operator": "Angry Box Porto"
                }
            ],
            "providerOrderId": "02123",
            "documentType": "invoice",
            "extraInfo": {
                "AM_TAX_PAYER_NUMBER": "",
                "AM_PROVIDER_ORDER_ID": "02123",
                "AM_PROVIDER_ESTIMATED_PICKUP_TS": "1785593987000",
                "AM_PROVIDER_ESTIMATED_PICKUP": "01/08/2026 15:19",
                "AM_ORDER_TYPE": "DELIVERY_BY_PROVIDER",
                "AM_PROVIDER_NAME": "UberEats",
                "AM_NOTE": ""
            }
        }
    ],
    "analytics": {
        "summary": {
            "totalOrders": 169,
            "totalCancellations": 0,
            "cancellationRate": 0,
            "grossRevenue": 4560.6,
            "vatCollected": 477.76,
            "netRevenue": 4082.84,
            "averageTicket": 26.99
        },
        "byPlatform": [
            {
                "platform": "Uber Eats",
                "orderCount": 116,
                "cancellationCount": 0,
                "grossRevenue": 3187.5,
                "vatCollected": 333.92,
                "netRevenue": 2853.58,
                "averageTicket": 27.48
            },
            {
                "platform": "Glovo",
                "orderCount": 49,
                "cancellationCount": 0,
                "grossRevenue": 1276.7,
                "vatCollected": 133.74,
                "netRevenue": 1142.96,
                "averageTicket": 26.06
            },
            {
                "platform": "Bolt Food",
                "orderCount": 4,
                "cancellationCount": 0,
                "grossRevenue": 96.4,
                "vatCollected": 10.1,
                "netRevenue": 86.3,
                "averageTicket": 24.1
            }
        ],
        "byCategory": [
            {
                "category": "Pizzas",
                "itemsSold": 241,
                "grossRevenue": 3888.7,
                "vatCollected": 447.37,
                "netRevenue": 3441.33,
                "subcategories": [
                    {
                        "category": "Classics",
                        "itemsSold": 85,
                        "grossRevenue": 1258.3,
                        "vatCollected": 144.76,
                        "netRevenue": 1113.54
                    },
                    {
                        "category": "Specials",
                        "itemsSold": 137,
                        "grossRevenue": 2398.3,
                        "vatCollected": 275.91,
                        "netRevenue": 2122.39
                    },
                    {
                        "category": "Sweeties",
                        "itemsSold": 19,
                        "grossRevenue": 232.1,
                        "vatCollected": 26.7,
                        "netRevenue": 205.4
                    }
                ]
            },
            {
                "category": "Outros",
                "itemsSold": 55,
                "grossRevenue": 509.4,
                "vatCollected": 0,
                "netRevenue": 509.4,
                "subcategories": []
            },
            {
                "category": "Drinks",
                "itemsSold": 65,
                "grossRevenue": 162.5,
                "vatCollected": 30.39,
                "netRevenue": 132.11,
                "subcategories": []
            }
        ],
        "byVatRate": [
            {
                "rate": 23,
                "grossRevenue": 162.5,
                "vatAmount": 30.39,
                "netRevenue": 132.11
            },
            {
                "rate": 13,
                "grossRevenue": 3888.7,
                "vatAmount": 447.37,
                "netRevenue": 3441.33
            },
            {
                "rate": 0,
                "grossRevenue": 509.4,
                "vatAmount": 0,
                "netRevenue": 509.4
            }
        ],
        "byDocumentType": {
            "invoices": {
                "count": 169,
                "grossRevenue": 4560.6
            },
            "creditNotes": {
                "count": 0,
                "grossRevenue": 0
            }
        },
        "topItems": [
            {
                "plu": "ITM-12465001",
                "title": "Honey Pepperoni S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 72,
                "grossRevenue": 1144.8
            },
            {
                "plu": "ITM-469585237",
                "title": "Creamy Garlic S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 41,
                "grossRevenue": 569.9
            },
            {
                "plu": "ITM-12465001",
                "title": "Honey Pepperoni L",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 18,
                "grossRevenue": 466.2
            },
            {
                "plu": "ITM-1168202192",
                "title": "Chicken & Cheese S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 27,
                "grossRevenue": 429.3
            },
            {
                "plu": "ITM-880163054",
                "title": "Tomate e Pesto S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 19,
                "grossRevenue": 264.1
            },
            {
                "plu": "ITM-4138583",
                "title": "Honey Pepperoni L",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 10,
                "grossRevenue": 259
            },
            {
                "plu": "ITM-653942416",
                "title": "4 Formaggios S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 14,
                "grossRevenue": 222.6
            },
            {
                "plu": "ITM-1435130297",
                "title": "Truffle Shrooms S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 12,
                "grossRevenue": 166.8
            },
            {
                "plu": "ITM-469585237",
                "title": "Creamy Garlic L",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 6,
                "grossRevenue": 141
            },
            {
                "plu": "ITM-1168202192",
                "title": "Chicken & Cheese L",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 4,
                "grossRevenue": 103.6
            },
            {
                "plu": "ITM-178495521",
                "title": "Cookies and Cream S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 8,
                "grossRevenue": 95.2
            },
            {
                "plu": "ITM-462578459",
                "title": "Coca-cola Zero 33cl",
                "category": "Drinks",
                "vatRate": 23,
                "quantitySold": 28,
                "grossRevenue": 70
            },
            {
                "plu": "ITM-902166555",
                "title": "Tuna e Mayo S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 5,
                "grossRevenue": 69.5
            },
            {
                "plu": "ITM-1581974950",
                "title": "Brigadeiro S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 5,
                "grossRevenue": 59.5
            },
            {
                "plu": "ITM-1204180063",
                "title": "Doce de Leite & Banana S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 5,
                "grossRevenue": 59.5
            },
            {
                "plu": "ITM-918194309",
                "title": "Coca-cola 33cl",
                "category": "Drinks",
                "vatRate": 23,
                "quantitySold": 22,
                "grossRevenue": 55
            },
            {
                "plu": "ITM-980595824",
                "title": "Chicken & Cheese L",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 2,
                "grossRevenue": 51.8
            },
            {
                "plu": "ITM-814113584",
                "title": "4 Formaggios L",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 2,
                "grossRevenue": 51.8
            },
            {
                "plu": "ITM-1911436907",
                "title": "Creamy Garlic L",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 2,
                "grossRevenue": 47
            },
            {
                "plu": "ITM-506707618",
                "title": "Sweet Smoked Shrimp S",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 2,
                "grossRevenue": 31.8
            },
            {
                "plu": "ITM-902166555",
                "title": "Tuna e Mayo L",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 1,
                "grossRevenue": 23.5
            },
            {
                "plu": "ITM-880163054",
                "title": "Tomate e Pesto L",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 1,
                "grossRevenue": 23.5
            },
            {
                "plu": "ITM-289626119",
                "title": "Truffle Shrooms L",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 1,
                "grossRevenue": 23.5
            },
            {
                "plu": "ITM-1249536430",
                "title": "Tomate e Pesto L",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 1,
                "grossRevenue": 23.5
            },
            {
                "plu": "ITM-357623863",
                "title": "Guaran� Ant�rtica 33cl",
                "category": "Drinks",
                "vatRate": 23,
                "quantitySold": 8,
                "grossRevenue": 20
            },
            {
                "plu": "ITM-1581974950",
                "title": "Brigadeiro L",
                "category": "Pizzas",
                "vatRate": 13,
                "quantitySold": 1,
                "grossRevenue": 17.9
            },
            {
                "plu": "",
                "title": "Focaccia de Doce de Leite e Banana XS",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 2,
                "grossRevenue": 17.8
            },
            {
                "plu": "",
                "title": "Estrella Galicia Especial",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 5,
                "grossRevenue": 17.5
            },
            {
                "plu": "",
                "title": "�gua mineral 51cl",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 4,
                "grossRevenue": 8
            },
            {
                "plu": "ITM-1659767771",
                "title": "Seven Up 33cl",
                "category": "Drinks",
                "vatRate": 23,
                "quantitySold": 3,
                "grossRevenue": 7.5
            },
            {
                "plu": "ITM-282852344",
                "title": "Ice Tea Lipton Lim�o 33cl",
                "category": "Drinks",
                "vatRate": 23,
                "quantitySold": 3,
                "grossRevenue": 7.5
            },
            {
                "plu": "",
                "title": "1906 Reserva Especial",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 1,
                "grossRevenue": 4
            },
            {
                "plu": "ITM-39423294",
                "title": "�gua Solan Cabras com g�s 33cl",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 1,
                "grossRevenue": 3.5
            },
            {
                "plu": "ITM-1169229135",
                "title": "Ice Tea Lipton P�ssego 33cl",
                "category": "Drinks",
                "vatRate": 23,
                "quantitySold": 1,
                "grossRevenue": 2.5
            },
            {
                "plu": "ITM-470313752",
                "title": "�gua Solan Cabras 33cl",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 1,
                "grossRevenue": 2
            },
            {
                "plu": "AM_DISCOUNT",
                "title": "Desconto",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 21,
                "grossRevenue": 0
            },
            {
                "plu": "AM_ERROR",
                "title": "Erro Pedido",
                "category": "Outros",
                "vatRate": 0,
                "quantitySold": 2,
                "grossRevenue": 0
            }
        ],
        "temporalDistribution": [
            {
                "period": "2026-07-31",
                "orderCount": 0,
                "grossRevenue": 0
            },
            {
                "period": "2026-08-01",
                "orderCount": 2,
                "grossRevenue": 77.8
            },
            {
                "period": "2026-08-02",
                "orderCount": 4,
                "grossRevenue": 79.5
            },
            {
                "period": "2026-08-03",
                "orderCount": 2,
                "grossRevenue": 63.3
            },
            {
                "period": "2026-08-04",
                "orderCount": 8,
                "grossRevenue": 280.3
            },
            {
                "period": "2026-08-05",
                "orderCount": 3,
                "grossRevenue": 47.7
            },
            {
                "period": "2026-08-06",
                "orderCount": 9,
                "grossRevenue": 220.5
            },
            {
                "period": "2026-08-07",
                "orderCount": 2,
                "grossRevenue": 53.7
            },
            {
                "period": "2026-08-08",
                "orderCount": 9,
                "grossRevenue": 250.5
            },
            {
                "period": "2026-08-09",
                "orderCount": 6,
                "grossRevenue": 207.5
            },
            {
                "period": "2026-08-10",
                "orderCount": 4,
                "grossRevenue": 112.8
            },
            {
                "period": "2026-08-11",
                "orderCount": 10,
                "grossRevenue": 326.8
            },
            {
                "period": "2026-08-12",
                "orderCount": 8,
                "grossRevenue": 200.6
            },
            {
                "period": "2026-08-13",
                "orderCount": 5,
                "grossRevenue": 125.2
            },
            {
                "period": "2026-08-14",
                "orderCount": 5,
                "grossRevenue": 130.7
            },
            {
                "period": "2026-08-15",
                "orderCount": 3,
                "grossRevenue": 59.6
            },
            {
                "period": "2026-08-16",
                "orderCount": 10,
                "grossRevenue": 235.6
            },
            {
                "period": "2026-08-17",
                "orderCount": 3,
                "grossRevenue": 61.6
            },
            {
                "period": "2026-08-18",
                "orderCount": 5,
                "grossRevenue": 165.7
            },
            {
                "period": "2026-08-19",
                "orderCount": 3,
                "grossRevenue": 133.2
            },
            {
                "period": "2026-08-20",
                "orderCount": 4,
                "grossRevenue": 77
            },
            {
                "period": "2026-08-21",
                "orderCount": 3,
                "grossRevenue": 76
            },
            {
                "period": "2026-08-22",
                "orderCount": 9,
                "grossRevenue": 238.2
            },
            {
                "period": "2026-08-23",
                "orderCount": 11,
                "grossRevenue": 237.1
            },
            {
                "period": "2026-08-24",
                "orderCount": 3,
                "grossRevenue": 76.5
            },
            {
                "period": "2026-08-25",
                "orderCount": 6,
                "grossRevenue": 161
            },
            {
                "period": "2026-08-26",
                "orderCount": 4,
                "grossRevenue": 75.5
            },
            {
                "period": "2026-08-27",
                "orderCount": 4,
                "grossRevenue": 142.8
            },
            {
                "period": "2026-08-28",
                "orderCount": 8,
                "grossRevenue": 166.6
            },
            {
                "period": "2026-08-29",
                "orderCount": 4,
                "grossRevenue": 111.8
            },
            {
                "period": "2026-08-30",
                "orderCount": 6,
                "grossRevenue": 209.9
            }
        ]
    }
}