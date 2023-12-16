import { Button } from "@mui/material";
import React, { Component, useState, useEffect } from "react";
import "./App.css";
import { Search } from "./Search";
import { createTheme, ThemeProvider } from '@mui/material/styles';
import icon from './record.ico';

const theme = createTheme({
  status: {
    danger: '#e53e3e',
  },
  palette: {
    primary: {
      main: '#e37872',
      contrastText: '#fff',
    },
  },
});

// Can use below for description with some editing
/* The recommender pulls from a database of albums that are both in RateYourMusic's Top 5000 and available for streaming on Spotify. Simply type in your favorite album and retrieve the 5 most similar albums for your enjoyment. */

function Navigation() {
  const [mainPage, setMainPage] = useState(true)

  useEffect(() => {
    const favicon = document.getElementById('favicon');
    favicon.setAttribute('href', icon);
  }, []);
  
  return (
    <div className="mydiv">
      {
      mainPage ? 
      <div className="MainButtonDiv">
        <ThemeProvider theme={theme}>
          <Button 
          color="primary"
          className="MainButton"
          variant="contained" 
          onClick={() => setMainPage(false)}>
            Get Recommendations</Button>
        </ThemeProvider>
      </div> :
        <Search></Search>
      }
    </div>
  )
}

class App extends Component {
  render() {
    return (
      <>
        <Navigation/>
      </>
    );
  }
}

export default App;
