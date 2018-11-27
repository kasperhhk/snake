import { Component, ViewChild, AfterViewInit, ElementRef } from '@angular/core';
import { timer, fromEvent, Subject, Observable, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements AfterViewInit {
  @ViewChild('canvas')
  canvasRef: ElementRef<HTMLCanvasElement>;

  gameOver: boolean;

  private _context2d: CanvasRenderingContext2D;

  private _cheeseFactory: CheeseFactory;
  private _cheese: Cheese;
  private _snake: Snake;
  private _positionContext: PositionContext;

  private _fps = 60;
  private _tps = 10;

  private _directions: {
    up: Direction,
    down: Direction,
    left: Direction,
    right: Direction
  };

  private _subscriptions: Subscription[];

  ngAfterViewInit() {
    this._context2d = this.canvasRef.nativeElement.getContext('2d');

    this._directions = {
      up: new Direction(0,-1),
      down: new Direction(0,1),
      left: new Direction(-1,0),
      right: new Direction(1,0)
    };

    this._positionContext = new PositionContext({
      x: [0, 20],
      y: [0, 20]
    }, {
      x: [0, 640],
      y: [0, 480]
    });

    this._cheeseFactory = new CheeseFactory(this._positionContext, [1,15]);

    this.initGame();
  }

  restart() {
    this.initGame();
  }

  private initGame() {
    const start = new Position(5, 5, this._positionContext);

    this._snake = new Snake(start, 4, this._directions.right);

    this._cheese = this._cheeseFactory.createCheese(this._snake);
     
    const subFps = timer(0, 1000/this._fps).subscribe(() => this.redraw());

    const subTps = timer(0, 1000/this._tps).pipe(
      takeUntil(this._snake.died$)
    ).subscribe(() => this.tick());

    const subEnd = this._snake.died$.subscribe(() => {
      this._subscriptions.forEach(_ => _.unsubscribe());
      this._subscriptions = null;
      this.gameOver = true;
      this.redraw(); //last redraw of end-state
    });

    const subInput = fromEvent(window, 'keydown').subscribe((e: KeyboardEvent) => {
      this.handleUserInput(e);
    });

    this.gameOver = false;

    this._subscriptions = [subFps, subTps, subInput, subEnd];
  }

  private handleUserInput(e: KeyboardEvent) {
    const newDirection = this.getNewDirection(e.key);
    if (newDirection && newDirection.isTurn(this._snake.direction)) {
      this._snake.direction = newDirection;
    }
  }

  private getNewDirection(key: string) {
    switch (key) {
      case 'ArrowLeft': return this._directions.left;
      case 'ArrowRight': return this._directions.right;
      case 'ArrowUp': return this._directions.up;
      case 'ArrowDown': return this._directions.down;
    }
  }

  private redraw() {
    this._context2d.clearRect(this._positionContext.x.range[0], this._positionContext.y.range[0], this._positionContext.x.widths.range, this._positionContext.y.widths.range);

    if (this._cheese) {
      this.drawCheese();
    }
    this.drawSnake();
    this.drawBorder();
    //this.drawMap();    
  }

  private drawCheese() {
    this._context2d.fillStyle = "darkgreen";
    const [rx, ry] = this._positionContext.applyRange(this._cheese.position.x, this._cheese.position.y);
    this._context2d.fillRect(rx, ry, this._positionContext.x.widths.cell, this._positionContext.y.widths.cell);
  }

  private drawBorder() {
    this._context2d.strokeStyle = "black";
    this._context2d.strokeRect(this._positionContext.x.range[0], this._positionContext.y.range[0], this._positionContext.x.widths.range, this._positionContext.y.widths.range);
  }

  private drawMap() {
    this._context2d.strokeStyle = "black";    
    for (let x=this._positionContext.x.domain[0]; x<this._positionContext.x.domain[1]; x++) {
      for (let y=this._positionContext.y.domain[0]; y<this._positionContext.y.domain[1]; y++) {
        const [rx,ry] = this._positionContext.applyRange(x,y);
        this._context2d.strokeRect(rx,ry,this._positionContext.x.widths.cell, this._positionContext.y.widths.cell);
      }
    }
  }

  private drawSnake() {
    this._context2d.fillStyle = "darkgrey";
    for (let seg of this._snake.segments) {
      const [rx,ry] = this._positionContext.applyRange(seg.x,seg.y);
      this._context2d.fillRect(rx,ry,this._positionContext.x.widths.cell, this._positionContext.y.widths.cell);
    }

    this._context2d.fillStyle = this._snake.dead ? "red" : "gray";
    const [rx,ry] = this._positionContext.applyRange(this._snake.head.x,this._snake.head.y);
    this._context2d.fillRect(rx,ry,this._positionContext.x.widths.cell, this._positionContext.y.widths.cell);
  }

  private tick() {
    this._snake.tick();
    
    if (this._snake.segments.some(_ => _ !== this._snake.head && _.equals(this._snake.head))) {
      this._snake.kill();
    }

    if (this._cheese.position.equals(this._snake.head)) {
      this._snake.eat(this._cheese);
      this._cheese = this._cheeseFactory.createCheese(this._snake);
    }
  }
}

class Snake {
  private _nextDirection: Direction;
  private _direction: Direction;
  get direction() { return this._direction; }
  set direction(newDirection: Direction) {
    this._nextDirection = newDirection;
  }

  private _died$: Subject<any>;
  get died$() { return this._died$.asObservable(); }

  private _segments: Position[];
  get segments() { return this._segments; }
  get head() { return this._segments[0]; }

  private _food: number;
  
  private _dead: boolean;
  get dead() { return this._dead; }

  constructor(start: Position, initialFood: number, initialDirection: Direction) {
    this._direction = initialDirection;
    this._segments = [start];
    this._food = initialFood;
    this._dead = false;
    this._died$ = new Subject<any>();
  }

  eat(cheese: Cheese) {
    this._food += cheese.food;
  }

  kill() {
    this._dead = true;
    this._died$.next();
  }

  tick() {
    if (this._nextDirection) {
      this._direction = this._nextDirection;
      this._nextDirection = null;
    }

    const newhead = this._direction.applyTo(this.head);
    this._segments.unshift(newhead);

    if (this._food > 0) {
      this._food--;
    }
    else {
      this._segments.pop();
    }
  }
}

class Cheese {
  get position() { return this._position; }
  get food() { return this._food; }

  constructor(private _position: Position, private _food: number) {  }
}

class CheeseFactory {
  constructor(private _positionContext: PositionContext, private _food: [number, number]) {  }

  createCheese(snake: Snake) {
    const position = this.generatePosition(snake);    
    const food = Math.floor(Math.random()*(this._food[1] - this._food[0])) + this._food[0];

    return new Cheese(position, food);
  }

  private generatePosition(snake: Snake) {
    const possible: [number,number][] = [];
    for (let x = this._positionContext.x.domain[0]; x < this._positionContext.x.domain[1]; x++) {
      for (let y = this._positionContext.y.domain[0]; y < this._positionContext.y.domain[1]; y++) {
        const pos: [number, number] = [x,y];
        if (snake.segments.every(_ => !_.equals(pos))) {
          possible.push(pos);
        }
      }
    }

    let choice = Math.floor(Math.random()*possible.length);
    const pos = new Position(possible[choice][0],possible[choice][1], this._positionContext);

    return pos;
  }
}

class Position {
  get x() { return this._x; }
  get y() { return this._y; }

  constructor(private _x: number, private _y: number, private _context: PositionContext) {    
    const [x,y] = this._context.applyDomain(_x, _y);
    this._x = x;
    this._y = y;
  }

  createModified(dx: number, dy: number) {
    let x = this.x + dx;
    let y = this.y + dy;    

    return new Position(x,y,this._context);
  }

  getIndex() {
    const x = this.x - this._context.x.domain[0];
    const y = this.y - this._context.y.domain[0];
    return x + this._context.x.widths.domain * y;
  }

  equals(other: Position | [number, number]) {
    if (!other) return false;
    if (other instanceof Position) {
      return other.x == this.x && other.y == this.y;
    }
    return other[0] == this.x && other[1] == this.y;
  }

  static fromIndex(index: number, context: PositionContext) {
    const x = (index % context.x.widths.domain) + context.x.domain[0];
    const y = Math.floor(index / context.x.widths.domain) + context.y.domain[0];
    return new Position(x,y,context);
  }
}

interface AxisPositionContext {
  domain: [number, number],
  range: [number, number],
  widths: {
    range: number,
    domain: number,
    cell: number
  }
};

class PositionContext {
  private _x: AxisPositionContext;
  private _y: AxisPositionContext;

  get x() { return this._x; }
  get y() { return this._y; }
  
  constructor(domain: Interval2D, range: Interval2D) {
    const xWidths = this.getWidths(domain.x, range.x);
    this._x = {
      domain: domain.x,
      range: range.x,
      get widths() { return xWidths; }
    };

    const yWidths = this.getWidths(domain.y, range.y);
    this._y = {
      domain: domain.y,
      range: range.y,
      get widths() { return yWidths; }
    };
  }

  private getWidths(domain: [number, number], range: [number, number]) {
    const rw = range[1] - range[0];
    const dw = domain[1] - domain[0];
    const cellw = rw / dw;

    return {
      range: rw,
      domain: dw,
      cell: cellw
    };
  }

  applyRange(x: number, y: number) {
    x = this.applyRangeVector(x, this.x);
    y = this.applyRangeVector(y, this.y);
    return [x, y];
  }

  private applyRangeVector(val: number, context: AxisPositionContext) {
    return val * context.widths.cell + context.range[0];
  }

  applyDomain(x: number, y: number) {
    x = this.applyDomainVector(x, this.x);
    y = this.applyDomainVector(y, this.y);
    return [x, y];
  }

  private applyDomainVector(val: number, context: AxisPositionContext) {
    while (val < context.domain[0]) {
      val += context.widths.domain;
    }
    while (val >= context.domain[1]) {
      val = context.domain[0] + (val - context.domain[1]);
    }

    return val;
  }
}

interface Interval2D {
  x: [number, number];
  y: [number, number];
}

class Direction {
  constructor(private _dx: number, private _dy: number) { }

  applyTo(position: Position) {
    return position.createModified(this._dx, this._dy);
  }

  isTurn(previous: Direction) {
    return !(this._dx == previous._dx || this._dx == -previous._dx) && !(this._dy == previous._dy || this._dy == -previous._dy);
  }
}