# Hardverapro_scraper
Egy kereső a hardverapro.hu-hoz, komplett pc-k beárazásához is.


![hardver](https://github.com/user-attachments/assets/a6f389a1-dc00-4ec5-b928-d0cd4547ac6c)

![todo](https://github.com/user-attachments/assets/10ec6f87-edc1-4b45-9553-4212959598f8)

# Demo

https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdistinct-poorly-platypus.ngrok-free.app%2Fstatus&query=status&label=Demo&color=blue

https://distinct-poorly-platypus.ngrok-free.app

# Lokális futtatáshoz

```bash
# Klónozd ezt a repositoryt (ha még nem tetted meg)
$ git clone https://github.com/Bandita69/Hardverapro_scraper.git
$ cd Hardverapro_scraper

# Inicializáld a Node.js projektet és hozz létre egy package.json fájlt
$ npm init -y  # Létrehoz egy package.json-t alapértelmezett beállításokkal
# VAGY
$ yarn init -y # Ha a yarn-t preferálod

# Telepítsd a projekt req-t
$ npm install  # Vagy ha a yarn-t használod: yarn install

# Szükséged lesz egy futó Redis szerverre.
# Győződj meg róla, hogy az alapértelmezett hoszton és porton fut (127.0.0.1:6379).
# Lehet, hogy telepítened és el kell indítanod a Redist a rendszereden.

# Indítsd el a szervert
$ npm start  # Vagy ha preferálod: node server.js
```
