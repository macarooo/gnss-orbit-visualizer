#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/api/status')
def status():
    return jsonify({'version': '2.0', 'status': 'running'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
