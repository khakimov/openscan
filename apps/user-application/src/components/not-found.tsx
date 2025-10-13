import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function Buddha() {
  return (
    <>
      <style>{`
        .buddha {
          width: 13em;
          height: 19em;
          font-size: 10px;
          display: flex;
          align-items: center;
          flex-direction: column;
          position: relative;
          animation: buddha-float 3s ease-in-out infinite;
        }

        @keyframes buddha-float {
          50% {
            transform: translateY(-2em);
          }
        }

        .buddha .head {
          width: 12.5em;
          height: 12.5em;
          color: peachpuff;
          background:
            radial-gradient(
              circle at 50% 40%,
              tomato 0.6em,
              transparent 0.6em
            ),
            currentColor;
          border-radius: 50%;
          filter: brightness(0.9);
          box-shadow:
            5.8em 2em 0 -4.8em,
            -5.8em 2em 0 -4.8em,
            0 8.6em 0 -4.5em;
        }

        .buddha .eyes::before,
        .buddha .eyes::after {
          content: '';
          position: absolute;
          width: 1em;
          height: 0.5em;
          border: 0.6em solid #333;
          border-radius: 1em 1em 0 0;
          border-bottom: none;
          top: 6em;
        }

        .buddha .eyes::before {
          left: 2.5em;
        }

        .buddha .eyes::after {
          right: 2.5em;
        }

        .buddha .mouth {
          position: absolute;
          width: 1.5em;
          height: 0.5em;
          border: 0.5em solid tomato;
          border-radius: 0 0 1.5em 1.5em;
          border-top: none;
          top: 9em;
        }

        .buddha .body {
          position: absolute;
          width: 10em;
          height: 8em;
          background-color: coral;
          border-radius: 4em;
          bottom: 1em;
          z-index: -1;
        }

        .buddha .legs {
          position: absolute;
          width: inherit;
          height: 5em;
          background-color: coral;
          border-radius: 2.5em;
          bottom: 0;
          z-index: -1;
        }

        .buddha .shadow {
          position: absolute;
          width: inherit;
          height: 5em;
          background-color: rgba(0, 0, 0, 0.2);
          border-radius: 50%;
          bottom: -4em;
          transform: rotateX(100deg);
          animation: buddha-shadow 3s ease-in-out infinite;
        }

        @keyframes buddha-shadow {
          50% {
            transform: rotateX(100deg) translateY(-10em) scale(0.7);
          }
        }
      `}</style>
      <div className="buddha">
        <span className="head"></span>
        <span className="eyes"></span>
        <span className="mouth"></span>
        <span className="body"></span>
        <span className="legs"></span>
        <span className="shadow"></span>
      </div>
    </>
  );
}

export function NotFound({ children }: { children?: any }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Heading */}
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold tracking-tight">
                Page Not Found
              </h1>

              {/* Floating Buddha */}
              <div className="flex justify-center py-4">
                <Buddha />
              </div>

              <div className="text-muted-foreground">
                {children || (
                  <p>
                    The page you're looking for doesn't exist or has been moved.
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button 
                variant="default" 
                onClick={() => window.history.back()}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
              <Button variant="outline" asChild>
                <Link to="/" className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Home
                </Link>
              </Button>
            </div>

            {/* Help text */}
            <div className="pt-4 border-t w-full">
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <Search className="h-4 w-4" />
                <span>
                  Try checking the URL or use the search functionality
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
