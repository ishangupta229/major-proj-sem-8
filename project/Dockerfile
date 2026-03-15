FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY frontend /app/frontend
COPY merged_cardiac_training_dataset.csv /app/merged_cardiac_training_dataset.csv

WORKDIR /app/backend
RUN python train_model.py

EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
