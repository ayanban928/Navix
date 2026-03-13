mod auth;
mod chat;
mod errors;
mod middleware;
mod models;
mod trips;

use axum::{routing::{get, post}, Router};
use sqlx::postgres::PgPoolOptions;
use std::env;
use tower_http::cors::{Any, CorsLayer};

pub use errors::AppError;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub jwt_secret: String,
    pub openai_api_key: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let database_url   = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let jwt_secret     = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let openai_api_key = env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;

    let state = AppState { db, jwt_secret, openai_api_key };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/v1/auth/signup",          post(auth::signup))
        .route("/v1/auth/login",           post(auth::login))
        .route("/v1/trips",                get(trips::list_trips).post(trips::create_trip))
        .route("/v1/trips/:trip_id",       get(trips::get_trip).delete(trips::delete_trip))
        .route("/v1/trips/:trip_id/chat",  post(chat::chat))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    println!("Navix backend listening on http://0.0.0.0:8080");
    axum::serve(listener, app).await?;

    Ok(())
}
