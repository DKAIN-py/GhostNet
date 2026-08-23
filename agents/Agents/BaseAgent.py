from abc import ABC, abstractmethod
from typing import Dict, Any


class BaseAgent(ABC):

    @abstractmethod
    async def start(self) -> None:
        pass

    @abstractmethod
    async def stop(self) -> None:
        pass

    @abstractmethod
    async def _run_loop(self) -> None:
        pass

    @abstractmethod
    async def step(self) -> Dict[str, Any] | None:
        pass