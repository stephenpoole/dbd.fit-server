'use strict';
import pg from 'pg';
import { Env } from './services/Env';
import { ErrorCode, ErrorMessage } from './Enum';
import { Database } from './database/db';
import { Normalize } from './database/Normalize';
import { Denormalize } from './database/Denormalize';
import { Response } from './response/Response';
import { ErrorExtended as Error } from './response/Error';
import { Server } from './server';

let config = require('./config.json'),
    credentials = require('./credentials.json');

class App {
    constructor() {
        const server = new Server();

        this.db = new Database(
            Env.isDevelopment()
                ? credentials.development.database
                : credentials.production.database
        );

        server.post('/build/save', (request, response) => {
            const hash = Normalize.build(request.body);
            const uri = Normalize.buildURI(request.body);

            Promise.all([
                this.db.builds.create(request.body, hash),
                this.db.namedBuilds.create(request.body, hash, uri)
            ])
                .then(result => {
                    Response.ok(response, { uri });
                    logStats.call(this);
                })
                .catch(error => {
                    console.log(error);
                    Response.error(response);
                });

            function logStats() {
                Promise.all([
                    this.db.stats.createFromBuild(
                        Normalize.stats(request.body)
                    ),
                    this.db.buildStats.created({ hash })
                ]).catch(error => {
                    console.log(error);
                });
            }
        });

        server.post('/build/get', (request, response) => {
            this.db.namedBuilds
                .get(request.body)
                .then(result => {
                    if (!!result) {
                        this.db.builds
                            .get({ hash: result.buildHash })
                            .then(result1 => {
                                if (!!result1) {
                                    const build = Denormalize.build(
                                        Object.assign(result1, result)
                                    );

                                    Response.ok(response, build);

                                    incrementViewStats.call(
                                        this,
                                        build,
                                        result.buildHash
                                    );
                                } else {
                                    Response.error(
                                        response,
                                        new Error(
                                            ErrorMessage.NOT_FOUND,
                                            ErrorCode.NOT_FOUND
                                        )
                                    );
                                }
                            })
                            .catch(error => {
                                Response.error(response);
                            });
                    } else {
                        Response.error(
                            response,
                            new Error(
                                ErrorMessage.NOT_FOUND,
                                ErrorCode.NOT_FOUND
                            )
                        );
                    }
                })
                .catch(error => {
                    Response.error(response);
                });

            function incrementViewStats(build, hash) {
                Promise.all([
                    this.db.buildStats.viewed({ hash }),
                    this.db.stats.viewFromBuild(Normalize.stats(build))
                ]).catch(error => {
                    console.log(error);
                });
            }
        });

        server.get('*', (request, response) => {
            if (Env.isProduction()) {
                response.redirect(config.production.host);
            } else {
                Response.error(
                    response,
                    new Error(ErrorMessage.NOT_FOUND, ErrorCode.NOT_FOUND)
                );
            }
        });

        server.post('*', (request, response) => {
            if (Env.isProduction()) {
                response.redirect(config.production.host);
            } else {
                Response.error(
                    response,
                    new Error(ErrorMessage.NOT_FOUND, ErrorCode.NOT_FOUND)
                );
            }
        });

        server.start();
    }
}

let app = new App();
