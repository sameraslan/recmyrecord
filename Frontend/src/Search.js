import React, { useState, useRef } from "react";
import { enlargeArtworkUrl, albumConstructor } from "./Album";
import albumData from "./album_data_updated.json";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import ColorThief from "colorthief";
import "./Search.css";
import "./App.css";
import { Audio } from 'react-loader-spinner';
import { Slider, Stack } from "@mui/material";
import { styled, Link } from "@mui/material";


function rgb(values) {
    return "rgb(" + values.join(", ") + ")";
}

const MoodSlider = styled(Slider) ({
  color: '#a09d9d'
});

const numAlbums = 4200;

function Search() {
    const [getMessage, setGetMessage] = useState({ results: [] });
    const [userInput, setUserInput] = useState("");
    const [spinner, setSpinner] = useState(false)
    const [sliderVal, setSliderVal] = useState(1.765)
  
    const getAlbums = (albumNumber) => {
      if (albumNumber.length === 0) {
        setGetMessage({ results: [] });
      } else {
        // const url =
        //   "http://127.0.0.1:5000/flask/getSimilarByNumber/" +
        //   albumNumber + 
        //   "/" + sliderVal +
        //   "/" + numAlbums
        // ;
        const url = "https://album-rec-system.herokuapp.com/flask/getSimilarByNumber/" +
        albumNumber 
        + "/" +
        sliderVal + "/" + numAlbums
        ;
        fetch(url)
          .then(res => res.json())
          .then((response) => {
            setSpinner(false)
            const res = JSON.parse(response.albums);
            setGetMessage({ results: res.results }); // Call as parameter of function to deal with this stuff
          })
          .catch((error) => {
            console.log(error);
          });
      }
    };
  
    const clearInput = () => {
      setUserInput("");
    };
  
    const [filteredData, setFilteredData] = useState([]);
  
    const handleFilter = (event) => {
      const searchWord = event.target.value;
      setUserInput(searchWord);
      albumData = albumData.slice(0, numAlbums)
      const newFilter = albumData.filter((value) => {
        const titleAndArtist =
          value.Title.toLowerCase() + value.Artist.toLowerCase();
        return titleAndArtist.includes(searchWord.toLowerCase());
      });
  
      if (searchWord === "") {
        setFilteredData([]);
      } else {
        setFilteredData(newFilter);
      }
    };
  
    const [firstAlbumRendered, setFirstAlbumRendered] = useState(false);
  
    const divRef = useRef(null);
    const divSearchIconRef = useRef(null);
    const inputRef = useRef(null)
    const searchIconRef = useRef(null)
  
    const imgRef = React.createRef();
    const colorRef = useRef("");
  
    return (
      <>
        <div className="search">
          <div className="searchInputs">
            <div>
              <input
                ref={inputRef}
                onChange={(e) => {
                  handleFilter(e);
                }}
                value={userInput}
                type={"text"}
                placeholder="Search By Album Title/Artist..."
              ></input>
              {userInput.length != 0 && (
                <div id="dataResult" className="dataResult">
                  {filteredData.slice(0, 15).map((value) => {
                    return (
                      <div
                        className="dataDiv"
                        onClick={() => {
                          setSpinner(true)
                          setUserInput("");
                          setFirstAlbumRendered(false);
                          setGetMessage({ results: [] })
                          getAlbums(value.AlbumNumber);
                        }}
                        target="_blank"
                      >
                        <div className="dataItem">
                          {value.Title} - {value.Artist}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div ref={divSearchIconRef} className="searchIcon">
              {userInput.length === 0 ? (
                <SearchIcon ref={searchIconRef} fontSize="large" />
              ) : (
                <CloseIcon ref={searchIconRef} onClick={clearInput} />
              )}
            </div>
          </div>
          <div>
              <Stack direction="row" sx={{width:"300px", position: "relative"}} marginTop="120px" marginBottom="30px" verticalAlignment="center" display="inline-flex">
              <div className="sliderText">Mood / Emotion</div>
                <MoodSlider
                  defaultValue={1.765}
                  onChange={(e) => (setSliderVal(e.target.value))}
                  step={.01}
                  min={0}
                  max={3.53}
                  // color="secondary"
                  className="slider"
                  // style={{width:"40vw"}}
                  />
                <div className="sliderText">Audio Features</div>
              </Stack>
            </div>
          <div>
            {spinner && 
            <div
              style={{
                marginTop: "30vh",
                width: "100%",
                height: "100",
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              <Audio color="#FFFFFF" height="150" width="150" />
            </div>}
          </div>
        </div>
        { getMessage.results.length > 0 ? (
          <div style={{ display: "inline-block"}}>
            <div className="Title">
              {getMessage.results.length > 0 ? getMessage.results[0].Title : ""}
            </div>
              <div ref={divRef} id="Border" className="Border">
              <img
                src={
                  getMessage.results.length > 0
                    ? enlargeArtworkUrl(getMessage.results[0].CoverURL, 350)
                    : ""
                }
                ref={imgRef}
                className="CoverArt clickable-image"
                alt={
                  getMessage.results.length > 0
                    ? "Cover of " + getMessage.results[0].Title
                    : ""
                }
                onLoad={() => {
                  const colorThief = new ColorThief();
                  const img = imgRef.current;
                  img.crossOrigin = "Anonymous";
                  const palette = colorThief.getPalette(img, 5);
                  divRef.current.style.backgroundColor = rgb(palette[1]);
                  setFirstAlbumRendered(true);

                  // Set page css based on main album color palette
                  colorRef.current = rgb(palette[1]);
                  divSearchIconRef.current.style.borderColor = rgb(palette[1])
                  inputRef.current.style.borderColor = rgb(palette[1])
                  searchIconRef.current.style.color = rgb(palette[1])

                  document.body.style.backgroundImage = "linear-gradient("+ rgb(palette[0])+ ", " + rgb(palette[1]) + ")"
                }}
                onClick={() => {
                  window.open(getMessage.results[0].AlbumURL, "_blank", "noopener noreferrer");
                }}
              />
              </div>
            <div className="Artist">
              {" "}
              {getMessage.results.length > 0 ? getMessage.results[0].Artist : ""}
            </div>
          </div> ) : <></> }
        {firstAlbumRendered ? (
          <div>
            {getMessage.results.length > 0 ? (
              getMessage.results.slice(1).map((album) => {
                return albumConstructor(album, colorRef);
              })
            ) : (
              <></>
            )}
          </div>
        ) : (
          <></>
        )}
      </>
    );
}

export { Search }