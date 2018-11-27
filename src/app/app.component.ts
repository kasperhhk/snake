import { Component, ViewChild, AfterViewInit, ElementRef } from '@angular/core';
import { timer, fromEvent, Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements AfterViewInit {
  @ViewChild('canvas')
  canvasRef: ElementRef<HTMLCanvasElement>;

  private context2d: CanvasRenderingContext2D;

  private cheeseFactory: CheeseFactory;
  private cheese: Cheese;
  private snake: Snake;
  private positionContext: PositionContext;

  private fps = 60;
  private tps = 10;

  private directions: {
    up: Direction,
    down: Direction,
    left: Direction,
    right: Direction
  };

  ngAfterViewInit() {
    this.context2d = this.canvasRef.nativeElement.getContext('2d');

    this.directions = {
      up: new Direction(0,-1),
      down: new Direction(0,1),
      left: new Direction(-1,0),
      right: new Direction(1,0)
    };

    this.positionContext = new PositionContext({
      x: [0, 20],
      y: [0, 20]
    }, {
      x: [0, 640],
      y: [0, 480]
    });

    this.cheeseFactory = new CheeseFactory(this.positionContext, [1,15]);

    const start = new Position(5, 5, this.positionContext);

    this.snake = new Snake(start, 4, this.directions.right);

    this.cheese = this.cheeseFactory.createCheese(this.snake);
     
    timer(0, 1000/this.fps).subscribe(() => this.redraw());


    timer(0, 1000/this.tps).pipe(
      takeUntil(this.snake.died$)
    ).subscribe(() => this.tick())

    fromEvent(window, 'keydown').subscribe((e: KeyboardEvent) => {
      this.handleUserInput(e);
    });
  }

  private handleUserInput(e: KeyboardEvent) {
    const newDirection = this.getNewDirection(e.key);
    if (newDirection && newDirection.isTurn(this.snake.direction)) {
      this.snake.direction = newDirection;
    }
  }

  private getNewDirection(key: string) {
    switch (key) {
      case 'ArrowLeft': return this.directions.left;
      case 'ArrowRight': return this.directions.right;
      case 'ArrowUp': return this.directions.up;
      case 'ArrowDown': return this.directions.down;
    }
  }

  private redraw() {
    this.context2d.clearRect(this.positionContext.x.range[0], this.positionContext.y.range[0], this.positionContext.x.widths.range, this.positionContext.y.widths.range);

    if (this.cheese) {
      this.drawCheese();
    }
    this.drawSnake();
    this.drawBorder();
    //this.drawMap();    
  }

  private drawCheese() {
    this.context2d.fillStyle = "darkgreen";
    const [rx, ry] = this.positionContext.applyRange(this.cheese.position.x, this.cheese.position.y);
    this.context2d.fillRect(rx, ry, this.positionContext.x.widths.cell, this.positionContext.y.widths.cell);
  }

  private drawBorder() {
    this.context2d.strokeStyle = "black";
    this.context2d.strokeRect(this.positionContext.x.range[0], this.positionContext.y.range[0], this.positionContext.x.widths.range, this.positionContext.y.widths.range);
  }

  private drawMap() {
    this.context2d.strokeStyle = "black";    
    for (let x=this.positionContext.x.domain[0]; x<this.positionContext.x.domain[1]; x++) {
      for (let y=this.positionContext.y.domain[0]; y<this.positionContext.y.domain[1]; y++) {
        const [rx,ry] = this.positionContext.applyRange(x,y);
        this.context2d.strokeRect(rx,ry,this.positionContext.x.widths.cell, this.positionContext.y.widths.cell);
      }
    }
  }

  private drawSnake() {
    this.context2d.fillStyle = "darkgrey";
    for (let seg of this.snake.segments) {
      const [rx,ry] = this.positionContext.applyRange(seg.x,seg.y);
      this.context2d.fillRect(rx,ry,this.positionContext.x.widths.cell, this.positionContext.y.widths.cell);
    }

    this.context2d.fillStyle = this.snake.dead ? "red" : "gray";
    const [rx,ry] = this.positionContext.applyRange(this.snake.head.x,this.snake.head.y);
    this.context2d.fillRect(rx,ry,this.positionContext.x.widths.cell, this.positionContext.y.widths.cell);
  }

  private tick() {
    this.snake.tick();
    
    if (this.snake.segments.some(_ => _ !== this.snake.head && _.equals(this.snake.head))) {
      this.snake.kill();
    }

    if (this.cheese.position.equals(this.snake.head)) {
      this.snake.food += this.cheese.food;
      this.cheese = this.cheeseFactory.createCheese(this.snake);
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

  segments: Position[];
  get head() { return this.segments[0]; }

  food: number;
  
  private _dead: boolean;
  get dead() { return this._dead; }

  constructor(start: Position, initialFood: number, initialDirection: Direction) {
    this._direction = initialDirection;
    this.segments = [start];
    this.food = initialFood;
    this._dead = false;
    this._died$ = new Subject<any>();
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
    this.segments.unshift(newhead);

    if (this.food > 0) {
      this.food--;
    }
    else {
      this.segments.pop();
    }
  }
}

class Cheese {
  position: Position;
  food: number;

  constructor(position: Position, food: number) {
    this.position = position;
    this.food = food;
  }
}

class CheeseFactory {
  private positionContext: PositionContext;
  private food: [number, number];

  constructor(positionContext: PositionContext, food: [number, number]) {
    this.positionContext = positionContext;
    this.food = food;
  }

  createCheese(snake: Snake) {
    const position = this.generatePosition(snake);    
    const food = Math.floor(Math.random()*(this.food[1] - this.food[0])) + this.food[0];

    return new Cheese(position, food);
  }

  private generatePosition(snake: Snake) {
    const possible: [number,number][] = [];
    for (let x = this.positionContext.x.domain[0]; x < this.positionContext.x.domain[1]; x++) {
      for (let y = this.positionContext.y.domain[0]; y < this.positionContext.y.domain[1]; y++) {
        const pos: [number, number] = [x,y];
        if (snake.segments.every(_ => !_.equals(pos))) {
          possible.push(pos);
        }
      }
    }

    let choice = Math.floor(Math.random()*possible.length);
    const pos = new Position(possible[choice][0],possible[choice][1], this.positionContext);

    return pos;
  }
}

class Position {
  x: number;
  y: number;

  private context: PositionContext;

  constructor(x: number, y: number, context: PositionContext) {
    this.context = context;
    
    [x,y] = this.context.applyDomain(x, y);
    this.x = x;
    this.y = y;
  }

  createModified(dx: number, dy: number) {
    let x = this.x + dx;
    let y = this.y + dy;    

    return new Position(x,y,this.context);
  }

  getIndex() {
    const x = this.x - this.context.x.domain[0];
    const y = this.y - this.context.y.domain[0];
    return x + this.context.x.widths.domain * y;
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
  x: AxisPositionContext;
  y: AxisPositionContext;
  
  constructor(domain: Interval2D, range: Interval2D) {
    this.x = {
      domain: domain.x,
      range: range.x,
      widths: this.getWidths(domain.x, range.x)
    };
    this.y = {
      domain: domain.y,
      range: range.y,
      widths: this.getWidths(domain.y, range.y)
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
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  applyTo(position: Position) {
    return position.createModified(this.x, this.y);
  }

  isTurn(previous: Direction) {
    return !(this.x == previous.x || this.x == -previous.x) && !(this.y == previous.y || this.y == -previous.y);
  }
}