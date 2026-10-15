.PHONY: install test typecheck build dev

install:
	npm --prefix frontend ci
	python -m pip install --requirement backend/requirements.lock.txt

test:
	npm run test

typecheck:
	npm run typecheck

build:
	npm run build

dev:
	@echo "Run the frontend and backend in separate terminals:"
	@echo "  npm --prefix frontend run dev"
	@echo "  cd backend && uvicorn app.main:app --reload"
